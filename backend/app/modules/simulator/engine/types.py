"""Plain data types that cross the engine boundary.

The engine is pure: no FastAPI, no pydantic, no database, no network. `service.py` converts
CropTwin / connector data into these types, and engine results into `schemas.py` models.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class WeatherDay:
    day: date
    tmax_c: float
    tmin_c: float
    rain_mm: float
    solar_mj_m2: float           # ALLSKY_SFC_SW_DWN
    rh_pct: float                # RH2M
    wind_m_s: float              # WS2M (already at 2 m)


@dataclass(frozen=True)
class FieldSnapshot:
    """What the simulator needs to know about a field. Built from `croptwin.service`."""
    field_id: str
    latitude: float
    longitude: float
    area_ha: float
    soil_texture: str            # key of parameters.SOILS
    previous_crop_id: str | None
    irrigation_available: bool


@dataclass(frozen=True)
class Planting:
    """One scheduled crop season inside a simulated timeline."""
    season_index: int
    crop_id: str
    plant_day_offset: int        # days from the start of the track
    predecessor_crop_id: str | None


@dataclass(frozen=True)
class SeasonOutcome:
    """Result of one crop season in one ensemble track."""
    season_index: int
    crop_id: str
    track: int
    etc_mm: float                # crop water need
    eta_mm: float                # water actually used
    rain_mm: float               # in-season rain
    irrigation_mm: float
    heat_degree_days: float
    heat_stress_days: int
    water_factor: float          # 1 - Ky * (1 - ETa/ETc), clipped to [0, 1]
    heat_factor: float
    rotation_factor: float
    relative_yield: float        # product of the three factors
