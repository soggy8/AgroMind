"""Plain data types that cross the engine boundary.

The engine is pure: no FastAPI, pydantic, database or network. It uses numpy so the
ensemble of weather years runs as one vector. `service.py` converts CropTwin and connector
data into these types, and engine results into `schemas.py` models.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np


@dataclass(frozen=True)
class Climate:
    """Daily weather as arrays of shape (n_years, 365). Feb 29 is dropped.

    Year k of the array is calendar year `years[k]`.
    """
    years: tuple[int, ...]
    tmax_c: np.ndarray
    tmin_c: np.ndarray
    rain_mm: np.ndarray
    solar_mj_m2: np.ndarray     # ALLSKY_SFC_SW_DWN
    rh_pct: np.ndarray          # RH2M
    wind_m_s: np.ndarray        # WS2M (already at 2 m)
    latitude: float
    elevation_m: float
    source: str                 # e.g. "NASA POWER daily, 2001-2025"
    filled_values: int = 0      # missing values filled from the previous day

    @property
    def n_years(self) -> int:
        return len(self.years)

    def with_arrays(self, **arrays: np.ndarray) -> "Climate":
        return replace(self, **arrays)


@dataclass(frozen=True)
class SoilProfile:
    theta_fc: float
    theta_wp: float
    description: str            # e.g. "Clay loam (SoilGrids)"
    source: str

    @property
    def awc_mm_per_m(self) -> float:
        return 1000 * (self.theta_fc - self.theta_wp)


@dataclass(frozen=True)
class FieldSnapshot:
    """What the simulator needs to know about a field. Built in `ports.py`."""
    field_id: str
    name: str
    latitude: float
    longitude: float
    area_ha: float
    soil: SoilProfile
    previous_crop_id: str | None
    irrigation_available: bool
    water_storage_scale: float   # calibrated effective-storage multiplier, 1.0 = uncalibrated
    calibrated: bool


@dataclass(frozen=True)
class Planting:
    """One scheduled crop season inside a simulated timeline (same for every ensemble track)."""
    season_index: int
    crop_id: str
    plant_day: int              # days from Jan 1 of simulated year 0
    harvest_day: int            # exclusive
    predecessor_crop_id: str | None


@dataclass(frozen=True)
class EnsembleOutcome:
    """Result of one rotation run. Every array has shape (n_seasons, n_tracks)."""
    plantings: tuple[Planting, ...]
    etc_mm: np.ndarray          # crop water need
    eta_mm: np.ndarray          # water actually used
    rain_mm: np.ndarray         # in-season rain
    irrigation_mm: np.ndarray
    heat_degree_days: np.ndarray
    heat_stress_days: np.ndarray
    water_factor: np.ndarray    # 1 - Ky (1 - ETa/ETc), clipped to [0, 1]
    heat_factor: np.ndarray
    rotation_factor: np.ndarray
    relative_yield: np.ndarray  # yield / crop's typical yield under today's climate
    start_years: tuple[int, ...]  # calendar year each track starts in
