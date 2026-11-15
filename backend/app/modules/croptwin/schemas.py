"""CropTwin API contract. Also what `service.py` returns to CropDoctor and the Simulator."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

# FAO-56 Table 19 classes; must match the keys of simulator.parameters.SOILS (spec section 5).
SoilTexture = Literal["sand", "loamy_sand", "sandy_loam", "loam", "silt_loam", "silt",
                      "silty_clay_loam", "silty_clay", "clay"]
AreaSource = Literal["computed_from_boundary", "farmer"]
# The crops the Simulator models; must match the keys of simulator.parameters.CROPS and CROPS in
# frontend/src/modules/croptwin/types.ts (duplication recorded in docs/modules/croptwin.md).
CropId = Literal["maize", "soybean", "oats", "winter_wheat", "sunflower"]


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

class _FarmPoint(BaseModel):
    """The farm's point, where its map opens before any field is drawn. Both or neither."""
    location_lat: float | None = Field(None, ge=-90, le=90)
    location_lon: float | None = Field(None, ge=-180, le=180)

    @model_validator(mode="after")
    def _both_or_neither(self):
        sent = self.model_fields_set & {"location_lat", "location_lon"}
        if len(sent) == 1 or (self.location_lat is None) != (self.location_lon is None):
            raise ValueError("Send location_lat and location_lon together (or both null).")
        return self


class FarmCreate(_FarmPoint):
    name: str = Field(min_length=1, max_length=200)
    region: str | None = Field(None, max_length=200)
    priorities: FarmPriorities = FarmPriorities()
    constraints: str | None = None


class FarmUpdate(_FarmPoint):
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
    area_ha: float | None = Field(None, gt=0, description="Farmer-stated area. Send null to use the computed area.")
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

# Every timestamp leaves the API in UTC with its offset. SQLite (dev and tests) stores no time zone, so rows read back
# from it are naive; they were written as UTC, so mark them UTC rather than let a browser read them as local time.
UtcDatetime = Annotated[datetime, AfterValidator(lambda d: d if d.tzinfo else d.replace(tzinfo=timezone.utc))]

class _Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SoilLayerOut(_Orm, SoilLayerIn):
    id: str
    retrieved_at: UtcDatetime


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
    created_at: UtcDatetime
    updated_at: UtcDatetime


class FarmOut(_Orm):
    id: str
    name: str
    region: str | None
    priorities: FarmPriorities
    constraints: str | None
    location_lat: float | None
    location_lon: float | None
    fields: list[FieldOut]
    created_at: UtcDatetime
    updated_at: UtcDatetime


class PlaceOut(BaseModel):
    """A place-search result (OpenStreetMap via Nominatim). bbox is (south, west, north, east) in degrees."""
    name: str
    lat: float
    lon: float
    bbox: tuple[float, float, float, float] | None
    kind: str | None


class PlaceSearch(BaseModel):
    results: list[PlaceOut]
    attribution: str


class ColourReading(BaseModel):
    """A GIBS map pixel looked up in NASA's colour map. Ranges are NASA's own classes, never interpolated."""
    status: Literal["class", "nodata", "transparent", "unknown"]
    low: float | None = None
    high: float | None = None
    range_text: str | None = None
    units: str | None = None
    title: str | None = None
    label: str | None = None


class WeatherSeries(BaseModel):
    id: str  # POWER parameter, e.g. "PRECTOTCORR"
    name: str  # POWER's long name
    units: str  # POWER's units
    dates: list[str]
    values: list[float | None]  # None where POWER has no value yet (its fill value)


class WeatherOut(BaseModel):
    """Recent daily weather at a field's centroid from NASA POWER (labelled Modelled in the UI)."""
    source: str
    sources: list[str]  # POWER's own list of input sources for this response
    latitude: float
    longitude: float
    start: str | None
    end: str | None
    time_standard: str | None
    series: list[WeatherSeries]


class FarmSummary(_Orm):
    id: str
    name: str
    region: str | None
    field_count: int


class AdvisorContext(BaseModel):
    """Everything the AI advisor may use to explain a farm profile. It must not go beyond these facts."""
    instructions: str
    facts: list[str]
    suggested_questions: list[str]
