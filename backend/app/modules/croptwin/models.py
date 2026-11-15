"""CropTwin tables: the farm profile every other module reads (through service.py, never directly).

    farms 1──* fields 1──* soil_layers
                      1──* crop_history

Provenance is stored with the value: soil layers and crop history carry a `source`, and a
field's area records whether it was computed from the boundary or entered by the farmer.

A farm can also have a map point (location_lat/location_lon, migration 0003). Deleting a farm removes its fields,
soil layers and crop history (ORM cascades below) and, in the database, the Simulator's simulation_runs for that farm
(their farm_id foreign key is ON DELETE CASCADE, migration 0002).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.db import Base, IdMixin, JSONType, TimestampMixin, utcnow


class Farm(IdMixin, TimestampMixin, Base):
    __tablename__ = "farms"

    name: Mapped[str] = mapped_column(String(200))
    region: Mapped[str | None] = mapped_column(String(200))
    # Relative weights {"yield", "water", "risk", "soil", "margin"}; shape is schemas.FarmPriorities.
    priorities: Mapped[dict] = mapped_column(JSONType, default=dict)
    constraints: Mapped[str | None] = mapped_column(Text)  # farmer's own words, e.g. "no irrigation on west side"
    # The farm's point (WGS84), where its map opens before any field is drawn. Optional: fields locate a farm too.
    location_lat: Mapped[float | None] = mapped_column(Float)
    location_lon: Mapped[float | None] = mapped_column(Float)
    # The account that owns this farm (accounts.users.id, migration 0004). None: a public farm such as the demo farm,
    # which everyone may read and nobody may change (app/access.py). No foreign key, so CropTwin doesn't depend on
    # the accounts tables.
    owner_id: Mapped[str | None] = mapped_column(String(36), index=True, default=None)

    @property
    def public(self) -> bool:
        return self.owner_id is None

    fields: Mapped[list[Field]] = relationship(back_populates="farm", cascade="all, delete-orphan",
                                               order_by="Field.created_at")


class Field(IdMixin, TimestampMixin, Base):
    __tablename__ = "fields"

    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))

    boundary: Mapped[dict] = mapped_column(JSONType)  # GeoJSON Polygon, [lon, lat] order, WGS84
    centroid_lat: Mapped[float] = mapped_column(Float)
    centroid_lon: Mapped[float] = mapped_column(Float)
    area_ha: Mapped[float] = mapped_column(Float)
    area_source: Mapped[str] = mapped_column(String(40))  # "computed_from_boundary" | "farmer"

    irrigation_available: Mapped[bool] = mapped_column(Boolean, default=False)
    current_crop_id: Mapped[str | None] = mapped_column(String(40))
    # FAO-56 texture class if the farmer knows it ("silt_loam"...). Measured layers below take precedence.
    soil_texture: Mapped[str | None] = mapped_column(String(40))

    farm: Mapped[Farm] = relationship(back_populates="fields")
    soil_layers: Mapped[list[SoilLayer]] = relationship(back_populates="field", cascade="all, delete-orphan",
                                                        order_by="SoilLayer.depth_top_cm")
    crop_history: Mapped[list[CropHistory]] = relationship(back_populates="field", cascade="all, delete-orphan",
                                                           order_by="CropHistory.season_year.desc()")


class SoilLayer(IdMixin, Base):
    """One depth interval of soil composition, from SoilGrids or a farmer's lab report."""
    __tablename__ = "soil_layers"

    field_id: Mapped[str] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    depth_top_cm: Mapped[int] = mapped_column(Integer)
    depth_bottom_cm: Mapped[int] = mapped_column(Integer)
    sand_pct: Mapped[float | None] = mapped_column(Float)
    silt_pct: Mapped[float | None] = mapped_column(Float)
    clay_pct: Mapped[float | None] = mapped_column(Float)
    soc_g_kg: Mapped[float | None] = mapped_column(Float)
    ph: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(300))  # e.g. "ISRIC SoilGrids v2.0", "Farmer lab report"
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    field: Mapped[Field] = relationship(back_populates="soil_layers")


class CropHistory(IdMixin, Base):
    """A crop grown on a field in a season. Yield is optional and only what the farmer reported."""
    __tablename__ = "crop_history"
    __table_args__ = (UniqueConstraint("field_id", "season_year", "crop_id"),)

    field_id: Mapped[str] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    season_year: Mapped[int] = mapped_column(Integer)
    crop_id: Mapped[str] = mapped_column(String(40))
    yield_value: Mapped[float | None] = mapped_column(Float)
    yield_unit: Mapped[str | None] = mapped_column(String(20))  # "t/ha", "bu/ac"
    source: Mapped[str] = mapped_column(String(300), default="Farmer-provided")
    notes: Mapped[str | None] = mapped_column(Text)

    field: Mapped[Field] = relationship(back_populates="crop_history")
