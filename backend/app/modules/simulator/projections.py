"""NASA NEX-GDDP-CMIP6 climate projections as monthly change factors ("delta method").

For a location, each model's daily tasmax, tasmin and pr are read at the nearest 0.25 degree
grid cell for a reference period (1995-2014, historical run) and future periods (2041-2060,
2071-2090) under two emissions scenarios. Monthly means give per-month changes:
temperature in degrees C (future minus reference), precipitation as percent change. The simulator
adds these to the observed NASA POWER weather, so day-to-day variability stays observed.

Fetching uses NASA NCCS THREDDS point subsetting (one request per file, about 10 s each), so it
is run once per location and saved:

    cd backend && python -m app.modules.simulator.projections --lat 42.03 --lon -93.46

Years within each period are sampled (every SAMPLE_STEP-th year) to keep the download small;
the model spread usually dwarfs the sampling error. Data: NASA Earth Exchange Global Daily
Downscaled Projections (NEX-GDDP-CMIP6), Thrasher et al. (2022), Scientific Data 9:262.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import statistics
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from functools import lru_cache
from pathlib import Path

import numpy as np

CATALOG = "https://ds.nccs.nasa.gov/thredds/catalog/AMES/NEX/GDDP-CMIP6"
NCSS = "https://ds.nccs.nasa.gov/thredds/ncss/grid/AMES/NEX/GDDP-CMIP6"
MODELS = ("GFDL-ESM4", "MPI-ESM1-2-HR", "MRI-ESM2-0", "IPSL-CM6A-LR", "NorESM2-MM", "ACCESS-CM2")
VARIABLES = ("tasmax", "tasmin", "pr")
REFERENCE = ("historical", 1995, 2014)
SCENARIOS = {"ssp245": "Middle of the road (SSP2-4.5)", "ssp585": "High emissions (SSP5-8.5)"}
PERIODS = {"2050s": (2041, 2060), "2080s": (2071, 2090)}
SAMPLE_STEP = 3

SAMPLES = Path(__file__).resolve().parents[4] / "data" / "samples"
DEMO_FILE = SAMPLES / "nex_gddp_cmip6_story_county_ia.json"
DEMO_POINT = (42.03, -93.46)


# ---------- using saved projections ----------

def _files() -> list[Path]:
    return sorted(SAMPLES.glob("nex_gddp_cmip6_*.json"))


@lru_cache(maxsize=8)
def _load(path: Path) -> dict:
    return json.loads(path.read_text())


def available(lat: float, lon: float) -> dict | None:
    """Saved projections whose grid cell covers this point, or None."""
    for path in _files():
        data = _load(path)
        if abs(lat - data["lat"]) <= 0.125 + 0.25 and abs(lon - data["lon"]) <= 0.125 + 0.25:
            return data
    return None


def options(lat: float, lon: float) -> list[dict]:
    """Scenario x period choices with the ensemble's growing-season change, for the UI."""
    data = available(lat, lon)
    if not data:
        return []
    out = []
    for ssp, ssp_name in SCENARIOS.items():
        for period, (y0, y1) in PERIODS.items():
            block = data["changes"].get(ssp, {}).get(period)
            if not block:
                continue
            season = slice(4, 9)  # May-Sep
            per_model_t = [statistics.mean((np.array(m["tasmax"][season]) + np.array(m["tasmin"][season])) / 2)
                           for m in block["models"].values()]
            per_model_p = [statistics.mean(m["pr_pct"][season]) for m in block["models"].values()]
            out.append({"id": f"{ssp}_{period}", "ssp": ssp, "ssp_name": ssp_name, "period": period,
                        "years": f"{y0}-{y1}", "models": len(block["models"]),
                        "temp_change_c": {"median": round(statistics.median(per_model_t), 1),
                                          "min": round(min(per_model_t), 1), "max": round(max(per_model_t), 1)},
                        "rain_change_pct": {"median": round(statistics.median(per_model_p)),
                                            "min": round(min(per_model_p)), "max": round(max(per_model_p))}})
    return out


def monthly_deltas(lat: float, lon: float, projection_id: str) -> dict[str, np.ndarray] | None:
    """Ensemble-median monthly changes: {'tasmax': 12 deg C, 'tasmin': 12 deg C, 'pr_pct': 12 %}."""
    data = available(lat, lon)
    if not data or "_" not in projection_id:
        return None
    ssp, period = projection_id.split("_", 1)
    block = data["changes"].get(ssp, {}).get(period)
    if not block:
        return None
    models = list(block["models"].values())
    return {k: np.median(np.array([m[k] for m in models]), axis=0) for k in ("tasmax", "tasmin", "pr_pct")}


# Calendar month (0-11) of each day in a 365-day simulated year.
MONTH_OF_DAY = np.array([date.fromordinal(date(2001, 1, 1).toordinal() + d).month - 1 for d in range(365)])


# ---------- fetching (one-off, network) ----------

def _year_files(client, model: str, experiment: str, var: str) -> dict[int, str]:
    url = f"{CATALOG}/{model}/{experiment}/r1i1p1f1/{var}/catalog.xml"
    text = client.get(url, timeout=60).text
    files = {}
    for path in re.findall(r'urlPath="([^"]+\.nc)"', text):
        m = re.search(r"_(\d{4})(?:_v[\d.]+)?\.nc$", path)
        if m:
            year = int(m.group(1))
            # Prefer the newest version when a year is listed twice (v1.1 / v2.0).
            if year not in files or path > files[year]:
                files[year] = path
    return files


def _monthly_means(client, path: str, var: str, lat: float, lon: float) -> list[float]:
    params = {"var": var, "latitude": lat, "longitude": lon % 360, "temporal": "all", "accept": "csv"}
    for attempt in range(3):
        try:
            r = client.get(f"{NCSS}/{path.removeprefix('AMES/NEX/GDDP-CMIP6/')}", params=params, timeout=120)
            r.raise_for_status()
            break
        except Exception:
            if attempt == 2:
                raise
    sums, counts = [0.0] * 12, [0] * 12
    rows = csv.reader(io.StringIO(r.text))
    next(rows)
    for row in rows:
        month = int(row[0][5:7]) - 1
        sums[month] += float(row[-1])
        counts[month] += 1
    return [s / c for s, c in zip(sums, counts)]


def fetch(lat: float, lon: float, workers: int = 10) -> dict:
    import httpx

    client = httpx.Client(follow_redirects=True)
    jobs = []
    for model in MODELS:
        for experiment in ["historical", *SCENARIOS]:
            for var in VARIABLES:
                files = _year_files(client, model, experiment, var)
                spans = [REFERENCE[1:]] if experiment == "historical" else list(PERIODS.values())
                for y0, y1 in spans:
                    for year in range(y0, y1 + 1, SAMPLE_STEP):
                        if year in files:
                            jobs.append((model, experiment, var, year, files[year]))
    print(f"{len(jobs)} requests")

    def work(job):
        model, experiment, var, year, path = job
        return job, _monthly_means(client, path, var, lat, lon)

    results: dict = {}
    with ThreadPoolExecutor(workers) as pool:
        for i, ((model, experiment, var, year, _), means) in enumerate(pool.map(work, jobs), 1):
            results.setdefault(model, {}).setdefault(experiment, {}).setdefault(var, {})[year] = means
            if i % 25 == 0:
                print(f"  {i}/{len(jobs)}")

    def period_mean(model, experiment, var, y0, y1):
        years = [v for y, v in results[model][experiment][var].items() if y0 <= y <= y1]
        return np.mean(np.array(years), axis=0) if years else None

    changes: dict = {}
    for model in MODELS:
        if model not in results or "historical" not in results[model]:
            continue
        ref = {v: period_mean(model, "historical", v, *REFERENCE[1:]) for v in VARIABLES}
        if any(r is None for r in ref.values()):
            continue
        for ssp in SCENARIOS:
            for period, (y0, y1) in PERIODS.items():
                fut = {v: period_mean(model, ssp, v, y0, y1) if ssp in results[model] else None for v in VARIABLES}
                if any(f is None for f in fut.values()):
                    continue
                changes.setdefault(ssp, {}).setdefault(period, {"models": {}})["models"][model] = {
                    "tasmax": np.round(fut["tasmax"] - ref["tasmax"], 3).tolist(),
                    "tasmin": np.round(fut["tasmin"] - ref["tasmin"], 3).tolist(),
                    "pr_pct": np.round((fut["pr"] / np.maximum(ref["pr"], 1e-12) - 1) * 100, 2).tolist(),
                }
    return {
        "_source": ("NASA NEX-GDDP-CMIP6 v2.0 (Thrasher et al. 2022, Sci. Data 9:262), NCCS THREDDS point "
                    f"subset, r1i1p1f1, every {SAMPLE_STEP}rd year sampled. Generated by "
                    "backend/app/modules/simulator/projections.py."),
        "lat": lat, "lon": lon, "reference": f"{REFERENCE[1]}-{REFERENCE[2]}", "sample_step": SAMPLE_STEP,
        "generated": date.today().isoformat(), "changes": changes,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, default=DEMO_POINT[0])
    ap.add_argument("--lon", type=float, default=DEMO_POINT[1])
    ap.add_argument("--out", type=Path, default=DEMO_FILE)
    args = ap.parse_args()
    data = fetch(args.lat, args.lon)
    args.out.write_text(json.dumps(data, indent=1))
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
