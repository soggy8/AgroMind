"""Build the committed CropDoctor samples from real data. Run once; needs the network.

    cd backend && .venv/bin/python -m app.modules.cropdoctor.fetch_samples

Raw per-item values are cached under data/cache/cropdoctor, so an interrupted run resumes.
"""
from __future__ import annotations

import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import httpx

from app.modules.croptwin import service as croptwin
from app.shared.db import session_scope

from . import ports
from .indicators.vegetation import Reading, parse_item_id

FIRST_MODIS_YEAR = 2000
CDL_YEARS = range(2008, 2022)
WORKERS = 8
POWER_LAT, POWER_LON = 42.03, -93.46  # the cell the Simulator's 2001-2025 sample uses


def _load_farm() -> tuple[tuple[float, float], dict[str, list[tuple[float, float]]]]:
    with session_scope() as session:
        farm = croptwin.get_farm(session, "demo")
        rings = {}
        for f in farm.fields:
            ring = [(lat, lon) for lon, lat in f.boundary.coordinates[0]]
            if len(ring) > 1 and ring[0] == ring[-1]:
                ring = ring[:-1]
            rings[f.id] = ring
        centre = (sum(f.centroid_lat for f in farm.fields) / len(farm.fields),
                  sum(f.centroid_lon for f in farm.fields) / len(farm.fields))
    return centre, rings


def _cached(path: Path, produce):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    value = produce()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")
    return value


def _modis_item(item_id: str, points: dict[str, list[tuple[float, float]]]) -> dict[str, list[list]]:
    def read() -> dict[str, list[list]]:
        return {fid: [ports.fetch_point(ports.MODIS, item_id, lat, lon, ports.NDVI_ASSETS) for lat, lon in pts]
                for fid, pts in points.items()}
    return _cached(ports.CACHE / "modis" / f"{item_id}.json", read)


def fetch_greenness(centre, points) -> dict[str, list[Reading]]:
    items: list[str] = []
    for year in range(FIRST_MODIS_YEAR, date.today().year + 1):
        items += ports.fetch_item_ids(ports.MODIS, centre[0], centre[1], date(year, 1, 1), date(year, 12, 31))
    items = sorted(set(items), key=lambda i: parse_item_id(i)[:2] + (i,))
    print(f"{len(items)} MODIS periods to read at {sum(len(p) for p in points.values())} points each.", flush=True)
    done = 0

    def one(item_id: str):
        nonlocal done
        res = _modis_item(item_id, points)
        done += 1
        if done % 50 == 0:
            print(f"  {done}/{len(items)}", flush=True)
        return item_id, res

    with ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(one, items))
    out: dict[str, list[Reading]] = {fid: [] for fid in points}
    for item_id, res in results:
        year, doy, sat = parse_item_id(item_id)
        for fid, vals in res.items():
            mean, used = ports.field_mean([(v[0], v[1]) if len(v) == 2 else (None, None) for v in vals])
            out[fid].append(Reading(year, doy, None if mean is None else round(mean, 4), sat, used, len(vals)))
    for rs in out.values():
        rs.sort(key=lambda r: (r.year, r.doy))
    return out


def fetch_crops(centre, points) -> dict[str, dict[int, tuple[int, str]]]:
    classes = httpx.get(f"{ports.STAC_URL}/collections/{ports.CDL}", timeout=40).json()
    names = {c["value"]: c["description"]
             for c in classes["item_assets"]["cropland"]["classification:classes"]}
    out: dict[str, dict[int, tuple[int, str]]] = {fid: {} for fid in points}
    jobs = []
    for year in CDL_YEARS:
        ids = [i for i in ports.fetch_item_ids(ports.CDL, centre[0], centre[1], date(year, 1, 1), date(year, 12, 31))
               if i.startswith("cropland_")]
        if not ids:
            print(f"  no crop map item for {year}", flush=True)
            continue
        for fid, pts in points.items():
            jobs.append((year, fid, ids[0], pts))

    def one(job):
        year, fid, item_id, pts = job

        def read():
            return [ports.fetch_point(ports.CDL, item_id, lat, lon, ["cropland"])[0] for lat, lon in pts]
        codes = _cached(ports.CACHE / "cdl" / f"{item_id}_{fid}.json", read)
        return year, fid, codes

    with ThreadPoolExecutor(WORKERS) as pool:
        for year, fid, codes in pool.map(one, jobs):
            valid = [int(c) for c in codes if c is not None]
            if valid:
                code = Counter(valid).most_common(1)[0][0]
                out[fid][year] = (code, names.get(code, f"Class {code}"))
    return out


def fetch_weather(today: date) -> str:
    text = ports.fetch_power_csv(POWER_LAT, POWER_LON, date(2026, 1, 1), today)
    note = f"Retrieved {today.isoformat()} from the NASA POWER daily point API, community AG, as returned."
    return text.replace("-BEGIN HEADER-", "-BEGIN HEADER-\n" + note, 1).replace("\r\n", "\n")


def summarise(rows: dict[str, list[Reading]]) -> None:
    for fid, rs in rows.items():
        full = sum(1 for r in rs if r.points_used == r.points_total and r.points_total) / max(len(rs), 1)
        print(f"{fid}: {len(rs)} readings, {full:.0%} with all {rs[0].points_total} points usable, "
              f"first {rs[0].year}/{rs[0].doy}, last {rs[-1].year}/{rs[-1].doy}")


def main() -> None:
    today = date.today()
    centre, rings = _load_farm()
    points = {fid: ports.sample_points(ring) for fid, ring in rings.items()}
    got = f"Retrieved {today.isoformat()}."
    greenness = fetch_greenness(centre, points)
    ports.write_readings(ports.GREENNESS_SAMPLE, greenness, [
        "# Source: MODIS MOD13Q1 (Terra) and MYD13Q1 (Aqua) version 061, 250 m, 16-day NDVI, via Microsoft Planetary Computer",
        f"# Collection: {ports.MODIS}, assets {ports.NDVI_ASSETS[0]} and {ports.NDVI_ASSETS[1]}. {got}",
        "# Method: five points per field (centroid plus four inset points inside the boundary); field mean of points",
        "# with pixel reliability 0 or 1, NDVI scaled by 0.0001; ndvi is blank when no point is usable.",
        "# doy is the start day of the 16-day period."])
    crops = fetch_crops(centre, points)
    ports.write_crops(ports.CROPS_SAMPLE, crops, [
        "# Source: USDA NASS Cropland Data Layer (30 m), via Microsoft Planetary Computer",
        f"# Collection: {ports.CDL}, asset cropland, 2008 to 2021 (the years the collection holds). {got}",
        "# Method: the same five points per field; the most common class code is the field's crop for the year.",
        "# Class names come from the collection's classification:classes."])
    ports.SAMPLES.mkdir(parents=True, exist_ok=True)
    (ports.WEATHER_SAMPLE_2026).write_text(fetch_weather(today), encoding="utf-8", newline="\n")
    summarise(greenness)
    print(f"Wrote {ports.GREENNESS_SAMPLE.name}, {ports.CROPS_SAMPLE.name}, {ports.WEATHER_SAMPLE_2026.name}.")


if __name__ == "__main__":
    main()
