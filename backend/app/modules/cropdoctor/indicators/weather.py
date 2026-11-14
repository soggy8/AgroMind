"""Daily weather types. Pure."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Day:
    tmax_c: float | None
    tmin_c: float | None
    rain_mm: float | None
    solar_mj_m2: float | None
    rh_pct: float | None
    wind_m_s: float | None


@dataclass(frozen=True)
class Weather:
    days: dict[date, Day]
    latitude: float
    longitude: float
    elevation_m: float
    source: str
