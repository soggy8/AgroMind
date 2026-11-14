"""HTTP only: parse, call the service, map errors."""
from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.shared.db import get_session

from . import service
from .schemas import (CropHistoryIn, FarmCreate, FarmOut, FarmSummary, FarmUpdate, FieldCreate, FieldOut,
                      FieldUpdate, SoilLayerIn)

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


def _no_content(fn: Callable[..., None], *args) -> Response:
    _call(fn, *args)
    return Response(status_code=204)


@router.get("", response_model=list[FarmSummary])
def list_farms(session: Session = DB):
    return service.list_farms(session)


@router.post("", response_model=FarmOut, status_code=201)
def create_farm(body: FarmCreate, session: Session = DB):
    return _call(service.create_farm, session, body)


@router.get("/{farm_id}", response_model=FarmOut)
def get_farm(farm_id: str, session: Session = DB):
    return _call(service.get_farm, session, farm_id)


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


@router.post("/{farm_id}/fields/{field_id}/crop-history", response_model=FieldOut, status_code=201)
def add_crop_history(farm_id: str, field_id: str, body: CropHistoryIn, session: Session = DB):
    return _call(service.add_crop_history, session, farm_id, field_id, body)


@router.delete("/{farm_id}/fields/{field_id}/crop-history/{entry_id}", status_code=204)
def delete_crop_history(farm_id: str, field_id: str, entry_id: str, session: Session = DB):
    return _no_content(service.delete_crop_history, session, farm_id, field_id, entry_id)
