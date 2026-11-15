"""CropTwin's public interface. CropDoctor, the Simulator and router.py call only these functions.

Every function takes a SQLAlchemy Session. HTTP code gets one from `get_session`; other code
(e.g. simulator/ports.py) can use `with session_scope() as s:` from app.shared.db.session.
Reads return pydantic schemas, never ORM rows, so callers can't lazy-load or write by accident.
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import geometry, repository, soil_source, weather_source
from .advisor import advisor_context
from .geometry import InvalidBoundary
from .models import CropHistory, Farm, Field, SoilLayer
from .soil_source import SoilDataUnavailable
from .schemas import (CropHistoryIn, FarmCreate, FarmOut, FarmSummary, FarmUpdate, FieldCreate, FieldOut,
                      FieldUpdate, SoilLayerIn, WeatherOut)
from .weather_source import WeatherUnavailable

__all__ = ["NotFound", "Conflict", "InvalidBoundary", "SoilDataUnavailable", "list_farms", "get_farm", "create_farm", "update_farm",
           "delete_farm", "list_fields", "get_field", "create_field", "update_field", "delete_field",
           "replace_soil_layers", "prefill_soil_from_soilgrids", "field_weather", "WeatherUnavailable", "add_crop_history", "delete_crop_history", "advisor_context"]


class NotFound(LookupError):
    """The farm, field or crop-history entry doesn't exist. router.py answers 404."""
    pass


class Conflict(ValueError):
    """The change breaks a rule: fields that overlap, or a duplicate record. router.py answers 409."""
    pass


# ---------- farms ----------

def list_farms(session: Session, owner_id: str | None = None) -> list[FarmSummary]:
    """Public farms plus the farms `owner_id` owns (only public farms when nobody is signed in)."""
    return [FarmSummary(id=f.id, name=f.name, region=f.region, field_count=n, public=f.public)
            for f, n in repository.list_farms(session, owner_id)]


def farm_owner(session: Session, farm_id: str) -> tuple[bool, str | None]:
    """(exists, owner_id) for a farm; owner_id None means a public farm. Used by app/access.py."""
    farm = session.get(Farm, farm_id)
    return (farm is not None, farm.owner_id if farm else None)


def get_farm(session: Session, farm_id: str) -> FarmOut:
    return FarmOut.model_validate(_farm(session, farm_id))


def create_farm(session: Session, data: FarmCreate, farm_id: str | None = None, owner_id: str | None = None) -> FarmOut:
    """A new farm. Without `owner_id` it is public and read-only (the seeded demo farm)."""
    farm = Farm(name=data.name, region=data.region, constraints=data.constraints,
                priorities=data.priorities.model_dump(by_alias=True),
                location_lat=data.location_lat, location_lon=data.location_lon, owner_id=owner_id)
    if farm_id:
        farm.id = farm_id
    session.add(farm)
    _commit(session)
    return get_farm(session, farm.id)


def update_farm(session: Session, farm_id: str, data: FarmUpdate) -> FarmOut:
    farm = _farm(session, farm_id)
    for key, value in _changes(data, by_alias=True).items():
        setattr(farm, key, value)
    _commit(session)
    return get_farm(session, farm_id)


def delete_farm(session: Session, farm_id: str) -> None:
    """Delete a farm, its fields, soil layers and crop history. In the database this also deletes the Simulator's saved runs for the farm (simulation_runs.farm_id is ON DELETE CASCADE, migration 0002)."""
    session.delete(_farm(session, farm_id))
    _commit(session)


# ---------- fields ----------

def list_fields(session: Session, farm_id: str) -> list[FieldOut]:
    return get_farm(session, farm_id).fields


def get_field(session: Session, farm_id: str, field_id: str) -> FieldOut:
    return FieldOut.model_validate(_field(session, farm_id, field_id))


def create_field(session: Session, farm_id: str, data: FieldCreate, field_id: str | None = None) -> FieldOut:
    """Add a field. Raises InvalidBoundary for a bad outline and Conflict if it shares area with another field."""
    farm = _farm(session, farm_id)
    _check_overlap(farm, data.boundary.model_dump(), None)
    field = Field(farm_id=farm_id, name=data.name, irrigation_available=data.irrigation_available,
                  current_crop_id=data.current_crop_id, soil_texture=data.soil_texture)
    if field_id:
        field.id = field_id
    _set_boundary(field, data.boundary.model_dump(), data.area_ha)
    session.add(field)
    _commit(session)
    return get_field(session, farm_id, field.id)


def update_field(session: Session, farm_id: str, field_id: str, data: FieldUpdate) -> FieldOut:
    """Change only what was sent. A new boundary is checked for overlap first; area_ha null means use the computed area."""
    field = _field(session, farm_id, field_id)
    changes = _changes(data)
    boundary = changes.pop("boundary", None)
    if boundary is not None:  # checked before anything changes, so a refused update leaves the field as it was
        _check_overlap(_farm(session, farm_id), boundary, field_id)
    area = changes.pop("area_ha", None)
    clear_area = "area_ha" in data.model_fields_set and data.area_ha is None  # back to the computed area
    for key, value in changes.items():
        setattr(field, key, value)
    if boundary is not None or clear_area:
        # A new boundary invalidates a computed area, but keeps an area the farmer stated
        # unless they send a new one (or null, to use the computed area again).
        farmer_area = field.area_ha if field.area_source == "farmer" and not clear_area else None
        _set_boundary(field, boundary if boundary is not None else field.boundary,
                      area if area is not None else farmer_area)
    elif area is not None:
        field.area_ha, field.area_source = area, "farmer"
    _commit(session)
    return get_field(session, farm_id, field_id)


def delete_field(session: Session, farm_id: str, field_id: str) -> None:
    session.delete(_field(session, farm_id, field_id))
    _commit(session)


def replace_soil_layers(session: Session, farm_id: str, field_id: str, layers: list[SoilLayerIn]) -> FieldOut:
    """Replace all of the field's soil layers with this list (the whole profile, not a patch)."""
    return _replace_soil(session, _field(session, farm_id, field_id), layers)


def prefill_soil_from_soilgrids(session: Session, farm_id: str, field_id: str) -> FieldOut:
    """Replace the field's soil layers with SoilGrids values at its centroid (mapped estimates, ~250 m).

    Raises SoilDataUnavailable when there is no SoilGrids data for the field's location.
    """
    field = _field(session, farm_id, field_id)
    profile = soil_source.soilgrids_profile(field.centroid_lat, field.centroid_lon)
    return _replace_soil(session, field, profile.layers, profile.retrieved_at)


def field_weather(session: Session, farm_id: str, field_id: str, days: int = 30) -> WeatherOut:
    """The last `days` days of NASA POWER daily weather at the field's centroid. Raises WeatherUnavailable."""
    field = _field(session, farm_id, field_id)
    return weather_source.recent_weather(field.centroid_lat, field.centroid_lon, days)


def add_crop_history(session: Session, farm_id: str, field_id: str, entry: CropHistoryIn) -> FieldOut:
    field = _field(session, farm_id, field_id)
    field.crop_history.append(CropHistory(**entry.model_dump()))
    _commit(session, f"{entry.crop_id} is already recorded for {entry.season_year} on this field.")
    return get_field(session, farm_id, field_id)


def delete_crop_history(session: Session, farm_id: str, field_id: str, entry_id: str) -> None:
    _field(session, farm_id, field_id)
    entry = repository.get_crop_history(session, field_id, entry_id)
    if entry is None:
        raise NotFound(f"Unknown crop history entry '{entry_id}'")
    session.delete(entry)
    _commit(session)


# ---------- helpers ----------

def _farm(session: Session, farm_id: str) -> Farm:
    farm = repository.get_farm(session, farm_id)
    if farm is None:
        raise NotFound(f"Unknown farm '{farm_id}'")
    return farm


def _field(session: Session, farm_id: str, field_id: str) -> Field:
    field = repository.get_field(session, farm_id, field_id)
    if field is None:
        raise NotFound(f"Unknown field '{field_id}' on farm '{farm_id}'")
    return field


_NULLABLE = {"region", "constraints", "current_crop_id", "soil_texture", "location_lat", "location_lon"}


def _changes(data, by_alias: bool = False) -> dict:
    """Fields the client sent. An explicit null clears optional columns and is ignored for required ones."""
    return {k: v for k, v in data.model_dump(exclude_unset=True, by_alias=by_alias).items()
            if v is not None or k in _NULLABLE}


def _replace_soil(session: Session, field: Field, layers: list[SoilLayerIn], retrieved_at=None) -> FieldOut:
    extra = {"retrieved_at": retrieved_at} if retrieved_at else {}
    field.soil_layers = [SoilLayer(**layer.model_dump(), **extra) for layer in layers]
    _commit(session)
    return get_field(session, field.farm_id, field.id)


def _check_overlap(farm: Farm, boundary: dict, skip_id: str | None) -> None:
    """Raise Conflict if the boundary shares area with another field on the farm (touching edges are fine)."""
    boundary = geometry.close_ring(boundary)
    geometry.area_ha(boundary)  # validates first, so a bad outline gets the 422 message, not this one
    hits = [f.name for f in farm.fields if f.id != skip_id and geometry.overlaps(boundary, f.boundary)]
    if hits:
        names = hits[0] if len(hits) == 1 else f"{', '.join(hits[:-1])} and {hits[-1]}"
        raise Conflict(f"This boundary overlaps {names}. Adjust it so fields don't share area.")


def _set_boundary(field: Field, boundary: dict, farmer_area_ha: float | None) -> None:
    boundary = geometry.close_ring(boundary)
    computed = geometry.area_ha(boundary)  # also validates
    field.boundary = boundary
    field.centroid_lat, field.centroid_lon = geometry.centroid(boundary)
    if farmer_area_ha is not None:
        field.area_ha, field.area_source = farmer_area_ha, "farmer"
    else:
        field.area_ha, field.area_source = round(computed, 2), "computed_from_boundary"


def _commit(session: Session, conflict_message: str = "That record already exists.") -> None:
    try:
        session.commit()
    except IntegrityError as e:
        session.rollback()
        raise Conflict(conflict_message) from e
