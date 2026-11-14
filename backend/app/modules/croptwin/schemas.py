"""CropTwin API contract. Also what `service.py` returns to CropDoctor and the Simulator."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

# FAO-56 Table 19 classes; must match the keys of simulator.parameters.SOILS (spec section 5).
SoilTexture = Literal["sand", "loamy_sand", "sandy_loam", "loam", "silt_loam", "silt",
                      "silty_clay_loam", "silty_clay", "clay"]
AreaSource = Literal["computed_from_boundary", "farmer"]
CropId = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*$", max_length=40)]  # "maize", "soybean"


class GeoJSONPolygon(BaseModel):
    """GeoJSON Polygon in WGS84, coordinates as [longitude, latitude] (RFC 7946)."""
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]] = Field(min_length=1)


class FarmPriorities(BaseModel):
    """Relative weights for ranking options. Defaults treat yield, water, risk and soil equally."""
    model_config = ConfigDict(populate_by_name=True)

    yield_: float = Field(1.0, ge=0, alias="yield")
    water: float = Field(1.0, ge=0)
    risk: float = Field(1.0, ge=0)
    soil: float = Field(1.0, ge=0)
    margin: float = Field(0.0, ge=0)


# ---------- requests ----------

class FarmCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    region: str | None = Field(None, max_length=200)
    priorities: FarmPriorities = FarmPriorities()
    constraints: str | None = None


class FarmUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    region: str | None = Field(None, max_length=200)
    priorities: FarmPriorities | None = None
    constraints: str | None = None


class FieldCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    boundary: GeoJSONPolygon
    area_ha: float | None = Field(None, gt=0, description="Farmer-stated area. Omit to compute it from the boundary.")
    irrigation_available: bool = False
    current_crop_id: CropId | None = None
    soil_texture: SoilTexture | None = None


class FieldUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    boundary: GeoJSONPolygon | None = None
    area_ha: float | None = Field(None, gt=0)
    irrigation_available: bool | None = None
    current_crop_id: CropId | None = None
    soil_texture: SoilTexture | None = None


class SoilLayerIn(BaseModel):
    depth_top_cm: int = Field(ge=0)
    depth_bottom_cm: int = Field(gt=0)
    sand_pct: float | None = Field(None, ge=0, le=100)
    silt_pct: float | None = Field(None, ge=0, le=100)
    clay_pct: float | None = Field(None, ge=0, le=100)
    soc_g_kg: float | None = Field(None, ge=0)
    ph: float | None = Field(None, ge=0, le=14)
    source: str = Field(min_length=1, max_length=300, description="Where the values came from.")

    @model_validator(mode="after")
    def _depths(self):
        if self.depth_bottom_cm <= self.depth_top_cm:
            raise ValueError("depth_bottom_cm must be greater than depth_top_cm")
        return self


class CropHistoryIn(BaseModel):
    season_year: int = Field(ge=1900, le=2100)
    crop_id: CropId
    yield_value: float | None = Field(None, ge=0)
    yield_unit: str | None = Field(None, max_length=20)
    source: str = Field("Farmer-provided", min_length=1, max_length=300)
    notes: str | None = None


# ---------- responses ----------

class _Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SoilLayerOut(_Orm, SoilLayerIn):
    id: str
    retrieved_at: datetime


class CropHistoryOut(_Orm, CropHistoryIn):
    id: str


class FieldOut(_Orm):
    id: str
    farm_id: str
    name: str
    boundary: GeoJSONPolygon
    centroid_lat: float
    centroid_lon: float
    area_ha: float
    area_source: AreaSource
    irrigation_available: bool
    current_crop_id: str | None
    soil_texture: SoilTexture | None
    soil_layers: list[SoilLayerOut]
    crop_history: list[CropHistoryOut]
    created_at: datetime
    updated_at: datetime


class FarmOut(_Orm):
    id: str
    name: str
    region: str | None
    priorities: FarmPriorities
    constraints: str | None
    fields: list[FieldOut]
    created_at: datetime
    updated_at: datetime


class FarmSummary(_Orm):
    id: str
    name: str
    region: str | None
    field_count: int
