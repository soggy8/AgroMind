"""CropDoctor's only door to the outside: committed samples and live fetchers.

The app reads committed samples (real MODIS greenness, USDA crop map, NASA POWER weather)
from data/samples. The fetchers below are used only by `fetch_samples`, never by tests.
"""
from __future__ import annotations

import csv
import re
import time
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import httpx

from app.core.config import REPO_ROOT

from .indicators.vegetation import Reading
from .indicators.weather import Day, Weather
from .parameters import GOOD_RELIABILITY


class DataUnavailable(RuntimeError):
    pass


SAMPLES: Path = REPO_ROOT / "data" / "samples"
CACHE: Path = REPO_ROOT / "data" / "cache" / "cropdoctor"
MODIS = "modis-13Q1-061"
CDL = "usda-cdl"
NDVI_ASSETS = ("250m_16_days_NDVI", "250m_16_days_pixel_reliability")

GREENNESS_SAMPLE = SAMPLES / "modis_ndvi_demo_fields.csv"
CROPS_SAMPLE = SAMPLES / "usda_cdl_demo_fields.csv"
WEATHER_SAMPLE = SAMPLES / "power_daily_story_county_ia_2001_2025.csv"
WEATHER_SAMPLE_2026 = SAMPLES / "power_daily_story_county_ia_2026.csv"

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
DATA_URL = "https://planetarycomputer.microsoft.com/api/data/v1"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_PARAMS = "T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M"
NDVI_FILL_BELOW = -2000  # raw NDVI at or below this is the product's fill value


# ---------- sampling ----------

def _inside(pt: tuple[float, float], ring: Sequence[tuple[float, float]]) -> bool:
    lat, lon = pt
    inside = False
    n = len(ring)
    for i in range(n):
        lat1, lon1 = ring[i]
        lat2, lon2 = ring[(i + 1) % n]
        if (lat1 > lat) != (lat2 > lat):
            if lon < (lon2 - lon1) * (lat - lat1) / (lat2 - lat1) + lon1:
                inside = not inside
    return inside


def _centroid(ring: Sequence[tuple[float, float]]) -> tuple[float, float]:
    area = cy = cx = 0.0
    n = len(ring)
    for i in range(n):
        y1, x1 = ring[i]
        y2, x2 = ring[(i + 1) % n]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(area) < 1e-18:
        return sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n
    return cy / (3 * area), cx / (3 * area)


def sample_points(ring: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    """Centroid first, then the points halfway between it and each bounding-box corner, inside the polygon only."""
    centre = _centroid(ring)
    lats, lons = [p[0] for p in ring], [p[1] for p in ring]
    pts = [centre]
    for lat in (min(lats), max(lats)):
        for lon in (min(lons), max(lons)):
            p = ((centre[0] + lat) / 2, (centre[1] + lon) / 2)
            if _inside(p, ring):
                pts.append(p)
    return pts


def field_mean(values: Sequence[tuple[float | None, float | None]]) -> tuple[float | None, int]:
    """Mean NDVI over points with good or marginal reliability; returns (ndvi, points used)."""
    good = [v for v, rel in values
            if v is not None and rel is not None and int(rel) in GOOD_RELIABILITY and v > NDVI_FILL_BELOW]
    if not good:
        return None, 0
    return sum(good) / len(good) * 0.0001, len(good)


# ---------- files ----------

def parse_power_csv(path: Path) -> Weather:
    text = Path(path).read_text(encoding="utf-8")
    lat = lon = elev = None
    rows: list[list[str]] = []
    header: list[str] | None = None
    for line in text.splitlines():
        if header is None:
            m = re.search(r"latitude\s+(-?[\d.]+)\s+longitude\s+(-?[\d.]+)", line)
            if m and line.startswith("Location"):
                lat, lon = float(m.group(1)), float(m.group(2))
            m = re.search(r"elevation.*?=\s*(-?[\d.]+)\s*meters", line)
            if m:
                elev = float(m.group(1))
            if line.startswith("YEAR,"):
                header = line.strip().split(",")
            continue
        if line.strip():
            rows.append(line.strip().split(","))
    if header is None or lat is None or lon is None or elev is None:
        raise DataUnavailable(f"{path.name} is not a NASA POWER daily CSV.")

    def val(x: str) -> float | None:
        f = float(x)
        return None if f <= -998 else f

    days: dict[date, Day] = {}
    for r in rows:
        rec = dict(zip(header, r))
        d = date(int(rec["YEAR"]), 1, 1) + timedelta(days=int(rec["DOY"]) - 1)
        days[d] = Day(val(rec["T2M_MAX"]), val(rec["T2M_MIN"]), val(rec["PRECTOTCORR"]),
                      val(rec["ALLSKY_SFC_SW_DWN"]), val(rec["RH2M"]), val(rec["WS2M"]))
    return Weather(days, lat, lon, elev, "NASA POWER daily, MERRA-2 and CERES, community AG")


def write_readings(path: Path, rows: Mapping[str, Sequence[Reading]], header: Sequence[str]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        for line in header:
            f.write(line.rstrip("\n") + "\n")
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["field_id", "year", "doy", "satellite", "ndvi", "points_used", "points_total"])
        for fid, rs in rows.items():
            for r in rs:
                w.writerow([fid, r.year, r.doy, r.satellite, "" if r.ndvi is None else f"{r.ndvi:.4f}",
                            r.points_used, r.points_total])


def _data_lines(path: Path) -> list[str]:
    return [ln for ln in Path(path).read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")]


def read_readings(path: Path) -> dict[str, list[Reading]]:
    out: dict[str, list[Reading]] = {}
    for rec in csv.DictReader(_data_lines(path)):
        out.setdefault(rec["field_id"], []).append(
            Reading(int(rec["year"]), int(rec["doy"]), float(rec["ndvi"]) if rec["ndvi"] else None,
                    rec["satellite"], int(rec["points_used"]), int(rec["points_total"])))
    return out


def write_crops(path: Path, rows: Mapping[str, Mapping[int, tuple[int, str]]], header: Sequence[str]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        for line in header:
            f.write(line.rstrip("\n") + "\n")
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["field_id", "year", "code", "crop"])
        for fid, years in rows.items():
            for year in sorted(years):
                code, name = years[year]
                w.writerow([fid, year, code, name])


@lru_cache(maxsize=1)
def _greenness() -> dict[str, list[Reading]]:
    return {k: sorted(v, key=lambda r: (r.year, r.doy)) for k, v in read_readings(GREENNESS_SAMPLE).items()}


@lru_cache(maxsize=1)
def _crops() -> dict[str, dict[int, str]]:
    out: dict[str, dict[int, str]] = {}
    for rec in csv.DictReader(_data_lines(CROPS_SAMPLE)):
        out.setdefault(rec["field_id"], {})[int(rec["year"])] = rec["crop"]
    return out


def load_greenness(field_id: str) -> list[Reading]:
    return list(_greenness().get(field_id, []))


def load_crops(field_id: str) -> dict[int, str]:
    return dict(_crops().get(field_id, {}))


@lru_cache(maxsize=1)
def load_weather() -> Weather:
    base = parse_power_csv(WEATHER_SAMPLE)
    days = dict(base.days)
    if WEATHER_SAMPLE_2026.exists():
        days.update(parse_power_csv(WEATHER_SAMPLE_2026).days)
    return Weather(days, base.latitude, base.longitude, base.elevation_m, base.source)


def has_sample(field_ids: Iterable[str]) -> bool:
    ids = list(field_ids)
    if not ids:
        return False
    known = _greenness()
    return all(i in known for i in ids)


# ---------- network (used only by fetch_samples) ----------

def _request(service: str, method: str, url: str, **kw) -> httpx.Response:
    last: Exception | None = None
    for attempt in range(3):
        try:
            r = httpx.request(method, url, timeout=40, **kw)
            r.raise_for_status()
            return r
        except (httpx.HTTPError, ValueError) as e:
            last = e
            time.sleep(2 ** attempt)
    raise DataUnavailable(f"{service} did not answer after three tries ({last}).")


def fetch_item_ids(collection: str, lat: float, lon: float, start: date, end: date) -> list[str]:
    body = {"collections": [collection], "intersects": {"type": "Point", "coordinates": [lon, lat]},
            "datetime": f"{start.isoformat()}/{end.isoformat()}", "limit": 100}
    r = _request("Microsoft Planetary Computer", "POST", f"{STAC_URL}/search", json=body)
    return [f["id"] for f in r.json().get("features", [])]


def fetch_point(collection: str, item_id: str, lat: float, lon: float, assets: Sequence[str]) -> list[float | None]:
    params = [("collection", collection), ("item", item_id)] + [("assets", a) for a in assets]
    r = _request("Microsoft Planetary Computer", "GET", f"{DATA_URL}/item/point/{lon},{lat}", params=params)
    return r.json().get("values", [])


def fetch_power_csv(lat: float, lon: float, start: date, end: date) -> str:
    params = {"parameters": POWER_PARAMS, "community": "AG", "latitude": lat, "longitude": lon,
              "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "CSV"}
    return _request("NASA POWER", "GET", POWER_URL, params=params).text
