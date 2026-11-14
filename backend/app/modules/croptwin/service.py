"""CropTwin's public interface. CropDoctor, the Simulator and router.py call only these functions.

Every function takes a SQLAlchemy Session. HTTP code gets one from `get_session`; other code
(e.g. simulator/ports.py) can use `with session_scope() as s:` from app.shared.db.session.
Reads return pydantic schemas, never ORM rows, so callers can't lazy-load or write by accident.
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import geometry, repository
from .geometry import InvalidBoundary
from .models import CropHistory, Farm, Field, SoilLayer
from .schemas import (CropHistoryIn, FarmCreate, FarmOut, FarmSummary, FarmUpdate, FieldCreate, FieldOut,
                      FieldUpdate, SoilLayerIn)

__all__ = ["NotFound", "Conflict", "InvalidBoundary", "list_farms", "get_farm", "create_farm", "update_farm",
           "delete_farm", "list_fields", "get_field", "create_field", "update_field", "delete_field",
           "replace_soil_layers", "add_crop_history", "delete_crop_history"]


class NotFound(LookupError):
    pass


class Conflict(ValueError):
    pass


# ---------- farms ----------

def list_farms(session: Session) -> list[FarmSummary]:
    return [FarmSummary(id=f.id, name=f.name, region=f.region, field_count=n)
            for f, n in repository.list_farms(session)]


def get_farm(session: Session, farm_id: str) -> FarmOut:
    return FarmOut.model_validate(_farm(session, farm_id))


def create_farm(session: Session, data: FarmCreate, farm_id: str | None = None) -> FarmOut:
    farm = Farm(name=data.name, region=data.region, constraints=data.constraints,
                priorities=data.priorities.model_dump(by_alias=True))
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
    session.delete(_farm(session, farm_id))
    _commit(session)


# ---------- fields ----------

def list_fields(session: Session, farm_id: str) -> list[FieldOut]:
    return get_farm(session, farm_id).fields


def get_field(session: Session, farm_id: str, field_id: str) -> FieldOut:
    return FieldOut.model_validate(_field(session, farm_id, field_id))


def create_field(session: Session, farm_id: str, data: FieldCreate, field_id: str | None = None) -> FieldOut:
    _farm(session, farm_id)
    field = Field(farm_id=farm_id, name=data.name, irrigation_available=data.irrigation_available,
                  current_crop_id=data.current_crop_id, soil_texture=data.soil_texture)
    if field_id:
        field.id = field_id
    _set_boundary(field, data.boundary.model_dump(), data.area_ha)
    session.add(field)
    _commit(session)
    return get_field(session, farm_id, field.id)


def update_field(session: Session, farm_id: str, field_id: str, data: FieldUpdate) -> FieldOut:
    field = _field(session, farm_id, field_id)
    changes = _changes(data)
    boundary = changes.pop("boundary", None)
    area = changes.pop("area_ha", None)
    for key, value in changes.items():
        setattr(field, key, value)
    if boundary is not None:
        # A new boundary invalidates a computed area, but keeps an area the farmer stated
        # unless they send a new one.
        keep = area if area is not None else (field.area_ha if field.area_source == "farmer" else None)
        _set_boundary(field, boundary, keep)
    elif area is not None:
        field.area_ha, field.area_source = area, "farmer"
    _commit(session)
    return get_field(session, farm_id, field_id)


def delete_field(session: Session, farm_id: str, field_id: str) -> None:
    session.delete(_field(session, farm_id, field_id))
    _commit(session)


def replace_soil_layers(session: Session, farm_id: str, field_id: str, layers: list[SoilLayerIn]) -> FieldOut:
    field = _field(session, farm_id, field_id)
    field.soil_layers = [SoilLayer(**layer.model_dump()) for layer in layers]
    _commit(session)
    return get_field(session, farm_id, field_id)


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


_NULLABLE = {"region", "constraints", "current_crop_id", "soil_texture"}


def _changes(data, by_alias: bool = False) -> dict:
    """Fields the client sent. An explicit null clears optional columns and is ignored for required ones."""
    return {k: v for k, v in data.model_dump(exclude_unset=True, by_alias=by_alias).items()
            if v is not None or k in _NULLABLE}


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
