"""The simulator's only door to the outside: farm and field data, soil, and weather.

Farm, fields, soil layers and priorities come from CropTwin (`croptwin.service`), with the
caller's database session. Weather still comes from a committed NASA POWER sample (or a live,
cached POWER request) until the shared connector in shared/connectors/nasa_power.py exists:
swap the body of `load_climate` then; nothing else changes.
"""
from __future__ import annotations

import csv
import json
import logging
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

import numpy as np
from sqlalchemy.orm import Session

from app.modules.croptwin import service as croptwin

from .engine import soil_water
from .engine.types import Climate, FieldSnapshot, SoilProfile
from .parameters import CENTRAL_IOWA_WATER_STORAGE_SCALE, DEFAULT_SOIL, DEFAULT_WATER_STORAGE_SCALE

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
ROOT_ZONE_CM = 100


class NotFound(LookupError):
    pass


class WeatherUnavailable(RuntimeError):
    pass


# ---------- farm and fields (CropTwin) ----------

@dataclass(frozen=True)
class FieldView:
    id: str
    name: str
    crop_id: str | None
    area_ha: float
    boundary: tuple[tuple[float, float], ...]  # (lat, lon) ring for the map
    irrigation_available: bool
    soil: SoilProfile


@dataclass(frozen=True)
class FarmView:
    id: str
    name: str
    region: str | None
    center: tuple[float, float] | None
    priorities: dict
    fields: tuple[FieldView, ...]


def _soil_from_layers(layers, texture: str | None) -> SoilProfile:
    """Root-zone soil: measured layers first, then the farmer's texture class, then an assumed loam.

    Each layer stands for the depth from the previous layer's bottom (or 0) to its own bottom, so
    gaps between sampled depths (SoilGrids skips 5-30 cm in our sample) belong to the layer below.
    """
    usable = sorted((l for l in layers if l.sand_pct is not None and l.clay_pct is not None),
                    key=lambda l: l.depth_bottom_cm)
    weighted, prev = [], 0
    for l in usable:
        top, bottom = prev, min(l.depth_bottom_cm, ROOT_ZONE_CM)
        if bottom > top:
            weighted.append((bottom - top, l))
        prev = max(prev, l.depth_bottom_cm)
    if weighted:
        total = sum(w for w, _ in weighted)
        avg = lambda attr: sum(w * (getattr(l, attr) or 0.0) for w, l in weighted) / total
        origin = "SoilGrids" if all("SoilGrids" in l.source for _, l in weighted) else "measured layers"
        return soil_water.from_composition(avg("sand_pct"), avg("clay_pct"), avg("soc_g_kg"), origin)
    if texture:
        return soil_water.from_texture(texture)
    p = soil_water.from_texture(DEFAULT_SOIL)
    return SoilProfile(p.theta_fc, p.theta_wp, "Loam (assumed: no soil data)", p.source + "; assumed")


def _field_view(f) -> FieldView:
    ring = tuple((lat, lon) for lon, lat in f.boundary.coordinates[0])
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return FieldView(id=f.id, name=f.name, crop_id=f.current_crop_id, area_ha=round(f.area_ha, 1), boundary=ring,
                     irrigation_available=f.irrigation_available, soil=_soil_from_layers(f.soil_layers, f.soil_texture))


def get_farm(session: Session, farm_id: str) -> FarmView:
    try:
        farm = croptwin.get_farm(session, farm_id)
    except croptwin.NotFound as e:
        raise NotFound(str(e)) from e
    fields = tuple(_field_view(f) for f in farm.fields)
    center = None
    if farm.fields:
        center = (sum(f.centroid_lat for f in farm.fields) / len(farm.fields),
                  sum(f.centroid_lon for f in farm.fields) / len(farm.fields))
    return FarmView(id=farm.id, name=farm.name, region=farm.region, center=center,
                    priorities=farm.priorities.model_dump(by_alias=True), fields=fields)


def load_field(session: Session, farm_id: str, field_id: str) -> FieldSnapshot:
    try:
        f = croptwin.get_field(session, farm_id, field_id)
    except croptwin.NotFound as e:
        raise NotFound(str(e)) from e
    lat, lon = f.centroid_lat, f.centroid_lon
    return FieldSnapshot(field_id=f.id, name=f.name, latitude=lat, longitude=lon, area_ha=f.area_ha,
                         soil=_soil_from_layers(f.soil_layers, f.soil_texture), previous_crop_id=f.current_crop_id,
                         irrigation_available=f.irrigation_available,
                         water_storage_scale=water_storage_scale(lat, lon), calibrated=_same_power_cell(lat, lon))


@dataclass(frozen=True)
class _SampleLayer:
    depth_bottom_cm: int
    sand_pct: float
    clay_pct: float
    soc_g_kg: float
    source: str = "ISRIC SoilGrids v2.0 sample"


@lru_cache(maxsize=1)
def load_soil() -> SoilProfile:
    """The demo farm's soil from the committed SoilGrids sample (used by calibration and tests)."""
    data = json.loads(SOIL_SAMPLE.read_text())
    layers = [_SampleLayer(int(l["depth"].split("-")[1].removesuffix("cm")), l["sand_pct"], l["clay_pct"], l["soc_g_kg"])
              for l in data["layers"]]
    return _soil_from_layers(layers, None)


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
