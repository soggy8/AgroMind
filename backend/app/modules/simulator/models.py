"""Simulator tables: saved runs.

A saved run keeps the request and the full result, so it reopens exactly as it was even after
the model or the farm changes. The summary columns let the list view skip the large JSON.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.db import Base, IdMixin, JSONType, TimestampMixin


class SimulationRun(IdMixin, TimestampMixin, Base):
    __tablename__ = "simulation_runs"

    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[str] = mapped_column(String(36))  # no FK: a run stays readable after its field is deleted
    name: Mapped[str] = mapped_column(String(80))
    scenario: Mapped[dict] = mapped_column(JSONType)
    rotation_names: Mapped[list] = mapped_column(JSONType)
    recommended_rotation: Mapped[str] = mapped_column(String(200))
    model_version: Mapped[str] = mapped_column(String(20))
    request: Mapped[dict] = mapped_column(JSONType)
    result: Mapped[dict] = mapped_column(JSONType)
