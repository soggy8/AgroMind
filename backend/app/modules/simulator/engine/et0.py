"""Reference evapotranspiration (FAO-56 chapter 3 and 4). Works on scalars or numpy arrays."""
from __future__ import annotations

import numpy as np

SOLAR_CONSTANT = 0.0820  # MJ m-2 min-1
STEFAN_BOLTZMANN = 4.903e-9  # MJ K-4 m-2 day-1


def extraterrestrial_radiation(lat_deg: float, doy) -> np.ndarray:
    """Ra in MJ/m2/day (FAO-56 Eq. 21)."""
    phi = np.radians(lat_deg)
    doy = np.asarray(doy, dtype=float)
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    delta = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(delta), -1.0, 1.0))
    return (24 * 60 / np.pi) * SOLAR_CONSTANT * dr * (
        ws * np.sin(phi) * np.sin(delta) + np.cos(phi) * np.cos(delta) * np.sin(ws)
    )


def _sat_vapour_pressure(t_c):
    return 0.6108 * np.exp(17.27 * t_c / (t_c + 237.3))


def penman_monteith(tmax_c, tmin_c, solar_mj_m2, rh_pct, wind_m_s, doy, lat_deg: float,
                    elevation_m: float) -> np.ndarray:
    """FAO-56 Penman-Monteith ET0 in mm/day (Eq. 6).

    Actual vapour pressure from mean relative humidity (Eq. 19), net longwave from Eq. 39,
    albedo 0.23, soil heat flux ignored for daily steps.
    """
    tmax_c, tmin_c = np.asarray(tmax_c, float), np.asarray(tmin_c, float)
    t_mean = (tmax_c + tmin_c) / 2
    pressure = 101.3 * ((293 - 0.0065 * elevation_m) / 293) ** 5.26
    gamma = 0.000665 * pressure
    delta = 4098 * _sat_vapour_pressure(t_mean) / (t_mean + 237.3) ** 2
    es = (_sat_vapour_pressure(tmax_c) + _sat_vapour_pressure(tmin_c)) / 2
    ea = np.asarray(rh_pct, float) / 100 * es

    ra = extraterrestrial_radiation(lat_deg, doy)
    rso = (0.75 + 2e-5 * elevation_m) * ra
    rs = np.asarray(solar_mj_m2, float)
    rns = (1 - 0.23) * rs
    rel_shortwave = np.clip(rs / np.maximum(rso, 1e-6), 0.0, 1.0)
    rnl = (STEFAN_BOLTZMANN * ((tmax_c + 273.16) ** 4 + (tmin_c + 273.16) ** 4) / 2
           * (0.34 - 0.14 * np.sqrt(np.maximum(ea, 0.0))) * (1.35 * rel_shortwave - 0.35))
    rn = rns - rnl

    u2 = np.asarray(wind_m_s, float)
    et0 = (0.408 * delta * rn + gamma * 900 / (t_mean + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))
    return np.maximum(et0, 0.0)


def hargreaves(tmax_c, tmin_c, doy, lat_deg: float) -> np.ndarray:
    """Hargreaves ET0 in mm/day (FAO-56 Eq. 52). Fallback when radiation, humidity or wind are missing."""
    tmax_c, tmin_c = np.asarray(tmax_c, float), np.asarray(tmin_c, float)
    ra_mm = 0.408 * extraterrestrial_radiation(lat_deg, doy)
    return np.maximum(0.0023 * ((tmax_c + tmin_c) / 2 + 17.8) * np.sqrt(np.maximum(tmax_c - tmin_c, 0.0)) * ra_mm, 0.0)


def climate_et0(climate) -> np.ndarray:
    """ET0 for a whole `Climate`, shape (n_years, 365)."""
    doy = np.arange(1, 366)[None, :]
    return penman_monteith(climate.tmax_c, climate.tmin_c, climate.solar_mj_m2, climate.rh_pct,
                           climate.wind_m_s, doy, climate.latitude, climate.elevation_m)
