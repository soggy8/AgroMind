"""Calibrate the simulator against USDA NASS county yields.

    cd backend && python -m app.modules.simulator.calibration [--write]

Compares modelled maize yield anomalies (one rain-fed season per year, after soybean) with
detrended Story County yields, 2001-2025, over a grid of the two calibrated parameters:
the effective water storage multiplier and the heat loss rate. The objective is to match the
*spread* of observed yield anomalies (how much yields vary from year to year), because that is
what sets the size of scenario effects. Year-to-year correlation is reported, not optimised.

2013 (wet spring, late planting) and 2020 (August derecho wind damage) are excluded from the
fit: the model has no excess-water or wind processes. Both are reported.
With --write, the report goes to docs/modules/simulator_calibration.md.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

import numpy as np

from . import ports
from .engine import crop_models, et0 as et0_mod
from .engine import runner
from .parameters import CROPS, DAYS_PER_YEAR, WARMING_K_PER_DD

EXCLUDED_YEARS = {2013: "wet spring and late planting", 2020: "August 2020 derecho"}
SCALES = (1.0, 1.4, 1.8, 2.2, 2.6, 3.0)
HEAT_LOSSES = (0.0, 0.002, 0.004, 0.006)


@dataclass
class Fit:
    scale: float
    heat_loss: float
    model_std: float
    rmse: float
    r: float
    r_all: float
    y2012: float
    scenario_change_pct: float  # maize, +2 C and -20% rain


def observed_anomalies(years: np.ndarray, crop: str = "corn") -> tuple[np.ndarray, np.ndarray]:
    table = {r["year"]: r[crop] for r in ports.load_county_yields()}
    obs = np.array([table.get(int(y)) or np.nan for y in years], dtype=float)
    ok = ~np.isnan(obs)
    slope, intercept = np.polyfit(years[ok], obs[ok], 1)
    return obs / (slope * years + intercept), np.array([slope, intercept])


def modelled(crop_id: str, predecessor: str, climate, et0, scale: float, heat_loss: float) -> np.ndarray:
    soil = ports.load_soil()
    o = runner.run(soil, runner.single_season(crop_id, predecessor), climate, et0, years=1,
                   root_depth_scale=scale, heat_loss_per_degday=heat_loss)
    return (o.water_factor * o.heat_factor)[0]


def grid() -> tuple[list[Fit], dict]:
    c = ports.load_sample_climate()
    e = et0_mod.climate_et0(c)
    hot = c.with_arrays(tmax_c=c.tmax_c + 2, tmin_c=c.tmin_c + 2, rain_mm=c.rain_mm * 0.8)
    e_hot = et0_mod.climate_et0(hot)
    years = np.array(c.years)
    ratio, trend = observed_anomalies(years)
    keep = ~np.isin(years, list(EXCLUDED_YEARS))
    fits = []
    for s in SCALES:
        for h in HEAT_LOSSES:
            m = modelled("maize", "soybean", c, e, s, h)
            a = m / m.mean()
            m_hot = modelled("maize", "soybean", hot, e_hot, s, h)
            fits.append(Fit(
                scale=s, heat_loss=h, model_std=float(a[keep].std()),
                rmse=float(np.sqrt(((a[keep] - ratio[keep]) ** 2).mean())),
                r=float(np.corrcoef(a[keep], ratio[keep])[0, 1]), r_all=float(np.corrcoef(a, ratio)[0, 1]),
                y2012=float(a[years == 2012][0]), scenario_change_pct=float((m_hot.mean() / m.mean() - 1) * 100)))
    target = float(ratio[keep].std())
    fits.sort(key=lambda f: abs(f.model_std - target))
    return fits, {"target_std": target, "trend": trend, "years": years, "ratio": ratio, "climate": c, "et0": e}


def soybean_check(scale: float, heat_loss: float, ctx) -> dict:
    years = ctx["years"]
    ratio, _ = observed_anomalies(years, "soybean")
    ok = ~np.isnan(ratio) & ~np.isin(years, list(EXCLUDED_YEARS))
    m = modelled("soybean", "maize", ctx["climate"], ctx["et0"], scale, heat_loss)
    a = m / m.mean()
    return {"n": int(ok.sum()), "obs_std": float(ratio[ok].std()), "model_std": float(a[ok].std()),
            "r": float(np.corrcoef(a[ok], ratio[ok])[0, 1])}


def solve_warming_rates(scale: float, heat_loss: float) -> dict[str, dict]:
    """Per crop, the warming rate k (per extra degree-day) that makes +1 C give the published US change.

    The local model (water balance + local heat rule) runs once on today's weather and once 1 C warmer;
    k scales the extra degree-days above the crop's warming threshold so the total change hits the target.
    """
    c = ports.load_sample_climate()
    soil = ports.load_soil()
    warm = c.with_arrays(tmax_c=c.tmax_c + 1, tmin_c=c.tmin_c + 1)
    e, e_warm = et0_mod.climate_et0(c), et0_mod.climate_et0(warm)
    out = {}
    for cid, crop in CROPS.items():
        years = 2 if crop.plant_doy + crop.season_days > DAYS_PER_YEAR else 1
        plant = runner.single_season(cid, "other")
        kw = dict(years=years, root_depth_scale=scale, heat_loss_per_degday=heat_loss)
        o0, o1 = runner.run(soil, plant, c, e, **kw), runner.run(soil, plant, warm, e_warm, **kw)
        y0, y1 = (o0.water_factor * o0.heat_factor)[0], (o1.water_factor * o1.heat_factor)[0]
        extra = o1.warming_degree_days[0] - o0.warming_degree_days[0]
        lo, hi = 0.0, 0.05
        for _ in range(60):
            k = (lo + hi) / 2
            change = ((y1 * crop_models.warming_factor(k, extra)).mean() / y0.mean() - 1) * 100
            lo, hi = (k, hi) if change > crop.warming_target_pct else (lo, k)
        out[cid] = {"k": round(k, 4), "local_pct": float((y1.mean() / y0.mean() - 1) * 100),
                    "target_pct": crop.warming_target_pct, "extra_dd": float(extra.mean()),
                    "in_parameters": WARMING_K_PER_DD.get(cid)}
    return out


def report(fits: list[Fit], ctx) -> str:
    best = fits[0]
    years, ratio = ctx["years"], ctx["ratio"]
    raw = next(f for f in fits if f.scale == 1.0 and f.heat_loss == best.heat_loss)
    soy = soybean_check(best.scale, best.heat_loss, ctx)
    m = modelled("maize", "soybean", ctx["climate"], ctx["et0"], best.scale, best.heat_loss)
    a = m / m.mean()
    rows = "\n".join(f"| {f.scale:.1f} | {f.heat_loss:.3f} | {f.model_std:.3f} | {f.rmse:.3f} | {f.r:+.2f} | "
                     f"{f.y2012:.2f} | {f.scenario_change_pct:+.1f}% |" for f in fits[:8])
    rates = solve_warming_rates(best.scale, best.heat_loss)
    rate_rows = "\n".join(f"| {CROPS[cid].name} | {r['local_pct']:+.1f}% | {r['target_pct']:+.1f}% | {r['extra_dd']:.0f} | "
                           f"{r['k']:.4f} | {r['in_parameters']} |" for cid, r in rates.items())
    yearly = "\n".join(f"| {int(y)} | {r:.2f} | {x:.2f} |{' excluded: ' + EXCLUDED_YEARS[int(y)] if int(y) in EXCLUDED_YEARS else ''}"
                       for y, r, x in zip(years, ratio, a))
    return f"""# Simulator calibration

Generated by `python -m app.modules.simulator.calibration --write` (from `backend/`). Do not edit by hand.

## Data

- Observed: USDA NASS Story County, Iowa maize yields 2001-2025 (`data/samples/nass_story_county_yields.csv`),
  detrended with a linear trend of {ctx['trend'][0]:.2f} bu/ac per year. Anomaly = yield / trend.
- Modelled: one rain-fed maize season per year after soybean, on the demo field's soil
  (SoilGrids clay loam), NASA POWER weather for the same grid cell. Anomaly = factor / mean factor.
- Fit target: the spread (standard deviation) of observed anomalies, {ctx['target_std']:.3f}, with
  {', '.join(f'{y} ({why})' for y, why in EXCLUDED_YEARS.items())} excluded.

## Result

Chosen: **water storage multiplier {best.scale:.1f}**, **heat loss {best.heat_loss:.3f} per C-day**.

| Storage multiplier | Heat loss per C-day | Model spread | RMSE | r (excl.) | Model 2012 | +2 C, -20% rain |
|---|---|---|---|---|---|---|
{rows}

Observed 2012 anomaly: {float(ratio[years == 2012][0]):.2f}.

Soybean check (not fitted, {soy['n']} years 2016-2025): observed spread {soy['obs_std']:.3f},
model spread {soy['model_std']:.3f}, r = {soy['r']:+.2f}.

## What this means

1. **Uncalibrated, the model overstated stress.** With FAO rooting depths the modelled anomaly
   spread was {raw.model_std:.2f} against {ctx['target_std']:.2f} observed, and 2012 came out at
   {raw.y2012:.2f} against {float(ratio[years == 2012][0]):.2f}.
   Story County's deep, tile-drained soils buffer dry spells far more than a 1.2 m bucket.
2. **The fix is an effective storage multiplier**, not a literal rooting depth. It stands in for subsoil
   water and water-table contributions. It applies to the calibrated grid cell only; elsewhere the
   model runs uncalibrated and says so.
3. **Year-to-year skill is weak** (r about {best.r:+.2f}). Simple weather indices (July-August rain,
   heat days) also correlate weakly with this county's yields (|r| < 0.25), so this is partly the
   county, not only the model. The simulator is fit for comparing rotations and scenarios on average,
   not for explaining a single year.
4. **The county's history implies a small response to warming.** The local model gives
   {best.scenario_change_pct:+.1f}% maize yield for +2 C and -20% rain. The published US average is
   several times steeper (maize -10.3% per C), so the simulator offers both and shows both numbers;
   "published" is the default (next section).

## Response to warming

The county's history shows a much smaller response to heat than published US averages, so the
simulator offers both. "Published" adds a warming response on top of the local model, applied only
to the heat a scenario adds over the same year today; k is solved so +1 C reproduces the target.
Targets: Zhao et al. (2017) PNAS 114:9326, USA estimates (maize -10.3 +/- 5.4, soybean -6.8 +/- 7.1,
wheat -5.5 +/- 4.4 % per C; oats and sunflower use proxies). Thresholds follow Schlenker & Roberts (2009).

| Crop | Local model, +1 C | Published target | Extra degree-days per +1 C | k solved | k in parameters.py |
|---|---|---|---|---|---|
{rate_rows}

## Year by year (chosen setting)

| Year | Observed anomaly | Modelled anomaly |
|---|---|---|
{yearly}
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="write docs/modules/simulator_calibration.md")
    args = ap.parse_args()
    fits, ctx = grid()
    text = report(fits, ctx)
    if args.write:
        path = ports.REPO_ROOT / "docs" / "modules" / "simulator_calibration.md"
        path.write_text(text)
        print(f"wrote {path}")
    else:
        print(text)


if __name__ == "__main__":
    main()
