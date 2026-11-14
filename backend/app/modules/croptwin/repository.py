"""Database reads. Writes are plain ORM adds/deletes in service.py; queries that need care live here."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .models import CropHistory, Farm, Field

_FIELD_DETAIL = (selectinload(Field.soil_layers), selectinload(Field.crop_history))


def list_farms(session: Session) -> list[tuple[Farm, int]]:
    counts = (select(Field.farm_id, func.count().label("n")).group_by(Field.farm_id).subquery())
    stmt = (select(Farm, func.coalesce(counts.c.n, 0))
            .outerjoin(counts, counts.c.farm_id == Farm.id)
            .order_by(Farm.created_at))
    return [(farm, n) for farm, n in session.execute(stmt)]


def get_farm(session: Session, farm_id: str) -> Farm | None:
    stmt = (select(Farm).where(Farm.id == farm_id)
            .options(selectinload(Farm.fields).options(*_FIELD_DETAIL)))
    return session.scalars(stmt).first()


def get_field(session: Session, farm_id: str, field_id: str) -> Field | None:
    stmt = select(Field).where(Field.id == field_id, Field.farm_id == farm_id).options(*_FIELD_DETAIL)
    return session.scalars(stmt).first()


def get_crop_history(session: Session, field_id: str, entry_id: str) -> CropHistory | None:
    return session.scalars(select(CropHistory).where(CropHistory.id == entry_id,
                                                     CropHistory.field_id == field_id)).first()
