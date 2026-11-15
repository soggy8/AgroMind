"""HTTP only: parse, call the service, map errors."""
from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.modules.accounts import service as accounts
from app.shared.db import get_session

from . import colour_classes, places, service
from .advisor import advisor_context
from .schemas import (AdvisorContext, CropHistoryIn, FarmCreate, FarmOut, FarmSummary, FarmUpdate, FieldCreate, FieldOut,
                      FieldUpdate, PlaceSearch, SoilLayerIn, ColourReading, WeatherOut)

router = APIRouter(prefix="/api/farms", tags=["croptwin"])
T = TypeVar("T")
DB = Depends(get_session)


def _call(fn: Callable[..., T], *args) -> T:
    try:
        return fn(*args)
    except service.NotFound as e:
        raise HTTPException(404, str(e)) from e
    except service.Conflict as e:
        raise HTTPException(409, str(e)) from e
    except service.InvalidBoundary as e:
        raise HTTPException(422, str(e)) from e
    except service.SoilDataUnavailable as e:
        raise HTTPException(503, str(e)) from e


def _no_content(fn: Callable[..., None], *args) -> Response:
    _call(fn, *args)
    return Response(status_code=204)


@router.get("", response_model=list[FarmSummary])
def list_farms(session: Session = DB, user_id: str | None = Depends(accounts.optional_user_id)):
    """The public demo farm plus the signed-in user's own farms."""
    return service.list_farms(session, user_id)


# Declared before /{farm_id} so "places" isn't read as a farm id.
@router.get("/places", response_model=PlaceSearch)
def search_places(q: str = Query(min_length=2, max_length=200),
                  lang: str | None = Query(None, max_length=35, pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$")):
    """Place names via OpenStreetMap Nominatim, within its usage policy (see places.py)."""
    try:
        return PlaceSearch(results=places.search(q, lang), attribution=places.ATTRIBUTION)
    except places.PlaceSearchBusy as e:
        raise HTTPException(429, str(e)) from e
    except places.PlaceSearchUnavailable as e:
        raise HTTPException(503, f"{e} Try again in a moment, or type coordinates such as 42.03, -93.46.") from e


@router.get("/nasa-colour", response_model=ColourReading)
def nasa_colour(colormap: str = Query(pattern=r"^[A-Za-z0-9_]{3,100}$"), r: int = Query(ge=0, le=255),
                g: int = Query(ge=0, le=255), b: int = Query(ge=0, le=255), a: int = Query(255, ge=0, le=255)):
    """NASA's value class for a GIBS map pixel's colour (see colour_classes.py)."""
    try:
        entries = colour_classes.colour_map(colormap)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except colour_classes.ColourMapUnavailable as e:
        raise HTTPException(503, f"{e} Try again in a moment.") from e
    return ColourReading(**colour_classes.classify(entries, (r, g, b), a).__dict__)


@router.post("", response_model=FarmOut, status_code=201)
def create_farm(body: FarmCreate, session: Session = DB, user_id: str = Depends(accounts.require_user_id)):
    """A new farm owned by the signed-in user (an account is needed)."""
    return _call(service.create_farm, session, body, None, user_id)


@router.get("/{farm_id}", response_model=FarmOut)
def get_farm(farm_id: str, session: Session = DB):
    return _call(service.get_farm, session, farm_id)


@router.get("/{farm_id}/advisor-context", response_model=AdvisorContext)
def get_advisor_context(farm_id: str, session: Session = DB):
    """The facts the AI advisor may use about this farm's profile."""
    return advisor_context(_call(service.get_farm, session, farm_id))


@router.patch("/{farm_id}", response_model=FarmOut)
def update_farm(farm_id: str, body: FarmUpdate, session: Session = DB):
    return _call(service.update_farm, session, farm_id, body)


@router.delete("/{farm_id}", status_code=204)
def delete_farm(farm_id: str, session: Session = DB):
    return _no_content(service.delete_farm, session, farm_id)


@router.post("/{farm_id}/fields", response_model=FieldOut, status_code=201)
def create_field(farm_id: str, body: FieldCreate, session: Session = DB):
    return _call(service.create_field, session, farm_id, body)


@router.get("/{farm_id}/fields/{field_id}", response_model=FieldOut)
def get_field(farm_id: str, field_id: str, session: Session = DB):
    return _call(service.get_field, session, farm_id, field_id)


@router.patch("/{farm_id}/fields/{field_id}", response_model=FieldOut)
def update_field(farm_id: str, field_id: str, body: FieldUpdate, session: Session = DB):
    return _call(service.update_field, session, farm_id, field_id, body)


@router.delete("/{farm_id}/fields/{field_id}", status_code=204)
def delete_field(farm_id: str, field_id: str, session: Session = DB):
    return _no_content(service.delete_field, session, farm_id, field_id)


@router.put("/{farm_id}/fields/{field_id}/soil", response_model=FieldOut)
def replace_soil(farm_id: str, field_id: str, body: list[SoilLayerIn], session: Session = DB):
    return _call(service.replace_soil_layers, session, farm_id, field_id, body)


@router.post("/{farm_id}/fields/{field_id}/soil/prefill", response_model=FieldOut)
def prefill_soil(farm_id: str, field_id: str, session: Session = DB):
    """Replace the field's soil layers with SoilGrids mapped estimates at its centroid."""
    return _call(service.prefill_soil_from_soilgrids, session, farm_id, field_id)


@router.get("/{farm_id}/fields/{field_id}/weather", response_model=WeatherOut)
def field_weather(farm_id: str, field_id: str, session: Session = DB):
    """Last 30 days of NASA POWER daily weather at the field's centroid."""
    try:
        return _call(service.field_weather, session, farm_id, field_id)
    except service.WeatherUnavailable as e:
        raise HTTPException(503, f"{e} Try again later.") from e


@router.post("/{farm_id}/fields/{field_id}/crop-history", response_model=FieldOut, status_code=201)
def add_crop_history(farm_id: str, field_id: str, body: CropHistoryIn, session: Session = DB):
    return _call(service.add_crop_history, session, farm_id, field_id, body)


@router.delete("/{farm_id}/fields/{field_id}/crop-history/{entry_id}", status_code=204)
def delete_crop_history(farm_id: str, field_id: str, entry_id: str, session: Session = DB):
    return _no_content(service.delete_crop_history, session, farm_id, field_id, entry_id)
