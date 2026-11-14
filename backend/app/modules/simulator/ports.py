"""The simulator's only door to the outside: field data and weather.

CropTwin (`croptwin.service`) and the shared NASA POWER connector are not built yet. Until they
are, this file serves a demo farm and reads committed sample files. Swap the bodies of
`list_fields`, `load_field` and `load_climate` when those modules exist; nothing else changes.
"""
from __future__ import annotations

import csv
import json
import logging
import math
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

import numpy as np

from .engine import soil_water
from .parameters import CENTRAL_IOWA_WATER_STORAGE_SCALE, DEFAULT_WATER_STORAGE_SCALE
from .engine.types import Climate, FieldSnapshot

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[4]
SAMPLES = REPO_ROOT / "data" / "samples"
CACHE = REPO_ROOT / "data" / "cache" / "power"
WEATHER_SAMPLE = SAMPLES / "power_daily_story_county_ia_2001_2025.csv"
SOIL_SAMPLE = SAMPLES / "soilgrids_story_county_ia.json"
YIELD_SAMPLE = SAMPLES / "nass_story_county_yields.csv"

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_PARAMS = ("T2M_MAX", "T2M_MIN", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M", "WS2M")
FIRST_YEAR, LAST_YEAR = 2001, 2025


class NotFound(LookupError):
    pass


class WeatherUnavailable(RuntimeError):
    pass


# ---------- farm and fields (stand-in for CropTwin) ----------

@dataclass(frozen=True)
class DemoField:
    id: str
    name: str
    crop_id: str
    area_ha: float
    boundary: tuple[tuple[float, float], ...]  # (lat, lon) ring
    irrigation_available: bool = False


@dataclass(frozen=True)
class DemoFarm:
    id: str
    name: str
    region: str
    center: tuple[float, float]
    fields: tuple[DemoField, ...]
    priorities: dict


def _rect(lat0: float, lon0: float, lat1: float, lon1: float) -> tuple[tuple[float, float], ...]:
    return ((lat0, lon0), (lat0, lon1), (lat1, lon1), (lat1, lon0))


def _area_ha(ring) -> float:
    lat_c = sum(p[0] for p in ring) / len(ring)
    xy = [(p[1] * 111_320 * math.cos(math.radians(lat_c)), p[0] * 110_574) for p in ring]
    a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(xy, xy[1:] + xy[:1]))
    return abs(a) / 2 / 10_000


# Rectangles over farmland in the sections north of the town; areas are computed from them.
_NORTH = _rect(42.03673, -93.46250, 42.04167, -93.45384)
_CREEK = _rect(42.03768, -93.45320, 42.04151, -93.44636)
_WEST = _rect(42.03720, -93.47104, 42.04151, -93.46310)

DEMO_FARM = DemoFarm(
    id="demo",
    name="Demo Farm",
    region="Story County, Iowa",
    center=(42.0392, -93.4587),
    fields=(
        DemoField("north", "North Field", "maize", round(_area_ha(_NORTH)), _NORTH),
        DemoField("creek", "Creek Field", "soybean", round(_area_ha(_CREEK)), _CREEK),
        DemoField("west", "West Field", "oats", round(_area_ha(_WEST)), _WEST),
    ),
    priorities={"yield": 1.0, "water": 1.0, "risk": 1.0, "soil": 1.0, "margin": 0.0},
)


def get_farm(farm_id: str) -> DemoFarm:
    if farm_id != DEMO_FARM.id:
        raise NotFound(f"Unknown farm '{farm_id}'")
    return DEMO_FARM


def list_fields(farm_id: str) -> tuple[DemoField, ...]:
    return get_farm(farm_id).fields


def load_field(farm_id: str, field_id: str) -> FieldSnapshot:
    farm = get_farm(farm_id)
    for f in farm.fields:
        if f.id == field_id:
            lat = sum(p[0] for p in f.boundary) / len(f.boundary)
            lon = sum(p[1] for p in f.boundary) / len(f.boundary)
            return FieldSnapshot(field_id=f.id, name=f.name, latitude=lat, longitude=lon, area_ha=f.area_ha,
                                 soil=load_soil(), previous_crop_id=f.crop_id,
                                 irrigation_available=f.irrigation_available,
                                 water_storage_scale=water_storage_scale(lat, lon),
                                 calibrated=_same_power_cell(lat, lon))
    raise NotFound(f"Unknown field '{field_id}'")


@lru_cache(maxsize=1)
def load_soil():
    """Root-zone (0-100 cm) composition from the SoilGrids sample, depth-weighted."""
    data = json.loads(SOIL_SAMPLE.read_text())
    weights = {"0-5cm": 5, "30-60cm": 55, "60-100cm": 40}  # 5-30 cm is represented by the 30-60 cm layer
    total = sum(weights.values())
    avg = {k: sum(l[k] * weights[l["depth"]] for l in data["layers"]) / total
           for k in ("sand_pct", "clay_pct", "soc_g_kg")}
    return soil_water.from_composition(avg["sand_pct"], avg["clay_pct"], avg["soc_g_kg"], "SoilGrids")


def soil_summary() -> dict:
    data = json.loads(SOIL_SAMPLE.read_text())
    top = data["layers"][0]
    return {"ph": top["ph"], "soc_g_kg": top["soc_g_kg"], "source": "ISRIC SoilGrids v2.0"}


# ---------- weather (stand-in for shared/connectors/nasa_power.py) ----------

def _to_climate(rows: dict[date, tuple[float, ...]], lat: float, elevation: float, source: str) -> Climate:
    """Daily rows -> (n_years, 365) arrays, dropping Feb 29 and filling -999 from the previous day."""
    years = sorted({d.year for d in rows})
    arrays = np.full((len(POWER_PARAMS), len(years), 365), np.nan)
    for d, vals in rows.items():
        if d.month == 2 and d.day == 29:
            continue
        doy = d.timetuple().tm_yday
        if d.year % 4 == 0 and (d.year % 100 != 0 or d.year % 400 == 0) and doy > 59:
            doy -= 1
        arrays[:, years.index(d.year), doy - 1] = vals
    arrays[arrays <= -998] = np.nan
    filled = int(np.isnan(arrays).sum())
    flat = arrays.reshape(len(POWER_PARAMS), -1)
    for p in flat:
        for i in np.flatnonzero(np.isnan(p)):
            p[i] = p[i - 1] if i > 0 else np.nanmean(p)
    arrays = flat.reshape(arrays.shape)
    tmax, tmin, rain, solar, rh, wind = arrays
    return Climate(years=tuple(years), tmax_c=tmax, tmin_c=tmin, rain_mm=rain, solar_mj_m2=solar, rh_pct=rh,
                   wind_m_s=wind, latitude=lat, elevation_m=elevation, source=source, filled_values=filled)


@lru_cache(maxsize=1)
def load_sample_climate() -> Climate:
    rows: dict[date, tuple[float, ...]] = {}
    lat = elevation = None
    with WEATHER_SAMPLE.open() as f:
        for line in f:
            if line.startswith("Location:"):
                parts = line.split()
                lat = float(parts[2])
            if line.startswith("elevation"):
                elevation = float(line.split("=")[1].split()[0])
            if line.startswith("YEAR"):
                break
        for r in csv.reader(f):
            d = date.fromordinal(date(int(r[0]), 1, 1).toordinal() + int(r[1]) - 1)
            rows[d] = tuple(float(x) for x in r[2:])
    return _to_climate(rows, lat or 42.03, elevation or 310.0,
                       f"NASA POWER daily (MERRA-2, CERES), {FIRST_YEAR}-{LAST_YEAR}")


def _same_power_cell(lat: float, lon: float) -> bool:
    c = load_sample_climate()
    return abs(lat - c.latitude) < 0.25 and abs(lon - (-93.46)) < 0.3125


def _fetch_power(lat: float, lon: float) -> Climate:
    import httpx  # imported lazily so the engine and tests never need the network

    key = f"{lat:.2f}_{lon:.2f}_{FIRST_YEAR}_{LAST_YEAR}.json"
    path = CACHE / key
    if path.exists():
        payload = json.loads(path.read_text())
    else:
        params = {"parameters": ",".join(POWER_PARAMS), "community": "AG", "latitude": f"{lat:.4f}",
                  "longitude": f"{lon:.4f}", "start": f"{FIRST_YEAR}0101", "end": f"{LAST_YEAR}1231",
                  "format": "JSON"}
        try:
            resp = httpx.get(POWER_URL, params=params, timeout=90)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise WeatherUnavailable(f"Couldn't reach NASA POWER ({e.__class__.__name__}).") from e
        payload = resp.json()
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload))
    series = payload["properties"]["parameter"]
    days = sorted(series[POWER_PARAMS[0]])
    rows = {date(int(k[:4]), int(k[4:6]), int(k[6:])): tuple(series[p][k] for p in POWER_PARAMS) for k in days}
    elevation = payload["geometry"]["coordinates"][2]
    return _to_climate(rows, lat, elevation, f"NASA POWER daily (MERRA-2, CERES), {FIRST_YEAR}-{LAST_YEAR}")


def water_storage_scale(lat: float, lon: float) -> float:
    """The calibration was done for the demo county; elsewhere the model runs uncalibrated."""
    return CENTRAL_IOWA_WATER_STORAGE_SCALE if _same_power_cell(lat, lon) else DEFAULT_WATER_STORAGE_SCALE


def load_climate(lat: float, lon: float) -> tuple[Climate, str]:
    """Observed daily weather for a location, and a data note for the UI.

    The demo farm sits in the sample's POWER grid cell, so it never needs the network.
    """
    if _same_power_cell(lat, lon):
        return load_sample_climate(), "Demo farm with sample data: NASA POWER weather saved for this grid cell."
    return _fetch_power(lat, lon), "Live NASA POWER weather for this location."


def load_county_yields() -> list[dict]:
    """USDA NASS Story County yields (bu/ac), for calibration."""
    with YIELD_SAMPLE.open() as f:
        rows = [l for l in f if not l.startswith("#")]
    out = []
    for r in csv.DictReader(rows):
        out.append({"year": int(r["year"]),
                    "corn": float(r["corn_bu_ac"]) if r["corn_bu_ac"] else None,
                    "soybean": float(r["soybean_bu_ac"]) if r["soybean_bu_ac"] else None})
    return out
