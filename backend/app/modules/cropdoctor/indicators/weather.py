"""Daily weather types. Pure."""
from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from ..baselines import Normal, normal
from ..parameters import MAX_MISSING_DAYS, MAX_WEATHER_LAG_DAYS, WEATHER_WINDOW_DAYS


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


_NEEDS = {
    "rain_mm": ("rain_mm",),
    "tmax_c": ("tmax_c",),
    "et0_mm": ("tmax_c", "tmin_c", "solar_mj_m2", "rh_pct", "wind_m_s"),
}
_SOLAR_CONSTANT = 0.0820      # MJ m-2 min-1
_STEFAN_BOLTZMANN = 4.903e-9  # MJ K-4 m-2 day-1


def _es(t: float) -> float:
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def _ra(latitude: float, doy: int) -> float:
    """Extraterrestrial radiation, MJ/m2/day (FAO-56 Eq. 21)."""
    phi = math.radians(latitude)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    delta = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(phi) * math.tan(delta))))
    return (24 * 60 / math.pi) * _SOLAR_CONSTANT * dr * (
        ws * math.sin(phi) * math.sin(delta) + math.cos(phi) * math.cos(delta) * math.sin(ws))


def et0_mm(day: Day, doy: int, latitude: float, elevation_m: float) -> float | None:
    """FAO-56 Penman-Monteith reference ET0 (Eq. 6), mm/day; None if an input is missing."""
    if None in (day.tmax_c, day.tmin_c, day.solar_mj_m2, day.rh_pct, day.wind_m_s):
        return None
    tmax, tmin, rs, rh, u2 = day.tmax_c, day.tmin_c, day.solar_mj_m2, day.rh_pct, day.wind_m_s
    t_mean = (tmax + tmin) / 2
    gamma = 0.000665 * 101.3 * ((293 - 0.0065 * elevation_m) / 293) ** 5.26
    delta = 4098 * _es(t_mean) / (t_mean + 237.3) ** 2
    es = (_es(tmax) + _es(tmin)) / 2
    ea = rh / 100 * es
    rso = (0.75 + 2e-5 * elevation_m) * _ra(latitude, doy)
    rel = max(0.0, min(1.0, rs / max(rso, 1e-6)))
    rnl = (_STEFAN_BOLTZMANN * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2
           * (0.34 - 0.14 * math.sqrt(max(ea, 0.0))) * (1.35 * rel - 0.35))
    rn = (1 - 0.23) * rs - rnl
    et0 = (0.408 * delta * rn + gamma * 900 / (t_mean + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))
    return max(et0, 0.0)


def window_end(weather: Weather, as_of: date, needs: Sequence[str]) -> date | None:
    for back in range(MAX_WEATHER_LAG_DAYS + 1):
        d = as_of - timedelta(days=back)
        day = weather.days.get(d)
        if day is not None and all(getattr(day, f) is not None for f in needs):
            return d
    return None


def _day_value(weather: Weather, d: date, stat: str) -> float | None:
    day = weather.days.get(d)
    if day is None:
        return None
    if stat == "et0_mm":
        return et0_mm(day, d.timetuple().tm_yday, weather.latitude, weather.elevation_m)
    return getattr(day, stat)


def window_stat(weather: Weather, end: date, stat: str) -> float | None:
    """rain_mm: sum; tmax_c and et0_mm: mean, over the window ending on `end`. Missing days are left out."""
    values = [v for v in (_day_value(weather, end - timedelta(days=i), stat)
                          for i in range(WEATHER_WINDOW_DAYS)) if v is not None]
    if WEATHER_WINDOW_DAYS - len(values) > MAX_MISSING_DAYS or not values:
        return None
    return sum(values) if stat == "rain_mm" else sum(values) / len(values)


def same_window_by_year(weather: Weather, end: date, stat: str) -> dict[int, float | None]:
    out: dict[int, float | None] = {}
    for y in sorted({d.year for d in weather.days}):
        try:
            e = end.replace(year=y)
        except ValueError:      # 29 Feb in a year without one
            e = date(y, 2, 28)
        out[y] = window_stat(weather, e, stat)
    return out


@dataclass(frozen=True)
class WeatherValue:
    stat: str
    value: float | None
    end: date | None
    normal: Normal | None
    diff: float | None           # percent for rain_mm and et0_mm, degrees C for tmax_c
    years_below: int | None      # normal years with a lower value


def _weather_value(weather: Weather, as_of: date, stat: str) -> WeatherValue:
    end = window_end(weather, as_of, _NEEDS[stat])
    if end is None:
        return WeatherValue(stat, None, None, None, None, None)
    value = window_stat(weather, end, stat)
    if value is None:
        return WeatherValue(stat, None, end, None, None, None)
    nrm = normal(same_window_by_year(weather, end, stat), end.year)
    if nrm is None:
        return WeatherValue(stat, value, end, None, None, None)
    if stat == "tmax_c":
        diff = value - nrm.mean
    else:
        diff = (value - nrm.mean) / nrm.mean * 100 if nrm.mean else None
    return WeatherValue(stat, value, end, nrm, diff, sum(1 for v in nrm.values if v < value))


def weather_values(weather: Weather, as_of: date) -> dict[str, WeatherValue]:
    return {stat: _weather_value(weather, as_of, stat) for stat in _NEEDS}
