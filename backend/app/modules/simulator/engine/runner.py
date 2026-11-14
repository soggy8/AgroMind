"""The ensemble loop: one rotation, every historical start year at once.

Track k replays the weather starting at historical year k: simulated year j uses weather year
(k + j) mod n_years. All tracks share the same planting schedule, so each day is one vector step.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np

from ..parameters import CROPS, DAYS_PER_YEAR, FALLOW_KC, FALLOW_ROOT_DEPTH_M
from . import crop_models, water_balance
from .types import Climate, EnsembleOutcome, Planting, SoilProfile


def run(soil: SoilProfile, plantings: Sequence[Planting], climate: Climate, et0: np.ndarray, *,
        years: int, irrigation: str = "none", irrigation_cap_mm: float | None = None,
        typical_factor: Mapping[str, float] | None = None,
        root_depth_scale: float = 1.0,
        heat_loss_per_degday: float | None = None) -> EnsembleOutcome:
    """Simulate `years` calendar years of the schedule on every ensemble track.

    `typical_factor[crop_id]` is the crop's mean water x heat factor under today's climate; dividing
    by it makes relative yield 1.0 in a typical year. Without it, relative yield is the raw factor.
    """
    n_tracks = climate.n_years
    horizon = years * DAYS_PER_YEAR
    n_seasons = len(plantings)

    season_of_day = np.full(horizon, -1, dtype=int)
    for i, pl in enumerate(plantings):
        season_of_day[pl.plant_day:min(pl.harvest_day, horizon)] = i

    crops = [CROPS[pl.crop_id] for pl in plantings]
    kc_by_season = [crop_models.kc_on_day(c, np.arange(c.season_days)) for c in crops]
    mid_by_season = [crop_models.is_mid_season(c, np.arange(c.season_days)) for c in crops]

    shape = (n_seasons, n_tracks)
    acc = {k: np.zeros(shape) for k in ("etc", "eta", "rain", "irr", "hdd", "hdays", "wdd")}
    irrigation_left = np.zeros(n_tracks)
    depletion = np.zeros(n_tracks)  # start at field capacity on Jan 1 (winter recharge)
    track = np.arange(n_tracks)
    fallow_taw = soil.awc_mm_per_m * FALLOW_ROOT_DEPTH_M

    for t in range(horizon):
        year_idx = (track + t // DAYS_PER_YEAR) % n_tracks
        doy = t % DAYS_PER_YEAR
        rain = climate.rain_mm[year_idx, doy]
        e0 = et0[year_idx, doy]
        s = season_of_day[t]
        if s < 0:
            depletion, _ = water_balance.step(depletion, et0=e0, kc=0.0, rain=rain, taw=fallow_taw, p=1.0,
                                              in_season=False, irrigate=False, irrigation_left=None,
                                              fallow_kc=FALLOW_KC)
            continue

        crop, pl = crops[s], plantings[s]
        dap = t - pl.plant_day
        if dap == 0:
            irrigation_left[:] = irrigation_cap_mm if irrigation == "limited" else np.inf
        taw = soil.awc_mm_per_m * crop.root_depth_m * root_depth_scale
        depletion, fx = water_balance.step(
            depletion, et0=e0, kc=float(kc_by_season[s][dap]), rain=rain, taw=taw, p=crop.depletion_p,
            in_season=True, irrigate=irrigation != "none",
            irrigation_left=irrigation_left if irrigation == "limited" else None, fallow_kc=FALLOW_KC)
        irrigation_left -= fx.irrigation
        acc["etc"][s] += fx.etc
        acc["eta"][s] += fx.eta
        acc["rain"][s] += rain
        acc["irr"][s] += fx.irrigation
        tmax = climate.tmax_c[year_idx, doy]
        acc["wdd"][s] += np.maximum(tmax - crop.warming_threshold_c, 0.0)
        if mid_by_season[s][dap]:
            excess = np.maximum(tmax - crop.heat_tcrit_c, 0.0)
            acc["hdd"][s] += excess
            acc["hdays"][s] += excess > 0

    wf = np.stack([crop_models.water_factor(c, acc["eta"][i], acc["etc"][i]) for i, c in enumerate(crops)]) \
        if n_seasons else np.zeros(shape)
    hf = crop_models.heat_factor(acc["hdd"]) if heat_loss_per_degday is None \
        else crop_models.heat_factor(acc["hdd"], heat_loss_per_degday)
    rot = np.array([[crop_models.rotation_factor(c, pl.predecessor_crop_id)] * n_tracks
                    for c, pl in zip(crops, plantings)]).reshape(shape)
    norm = np.array([[(typical_factor or {}).get(pl.crop_id, 1.0)] for pl in plantings]).reshape(n_seasons, 1) \
        if n_seasons else np.ones((0, 1))
    relative = wf * hf * rot / norm

    return EnsembleOutcome(
        plantings=tuple(plantings), etc_mm=acc["etc"], eta_mm=acc["eta"], rain_mm=acc["rain"],
        irrigation_mm=acc["irr"], heat_degree_days=acc["hdd"], heat_stress_days=acc["hdays"],
        warming_degree_days=acc["wdd"],
        water_factor=wf, heat_factor=hf, rotation_factor=rot, relative_yield=relative,
        start_years=tuple(climate.years),
    )


def single_season(crop_id: str, predecessor: str | None = None) -> list[Planting]:
    crop = CROPS[crop_id]
    start = crop.plant_doy - 1
    return [Planting(0, crop_id, start, start + crop.season_days, predecessor)]


def typical_factors(soil: SoilProfile, climate: Climate, et0: np.ndarray, crop_ids, **kwargs) -> dict[str, float]:
    """Mean water x heat factor per crop, one rain-fed season per historical year, after a different crop."""
    out = {}
    for cid in crop_ids:
        o = run(soil, single_season(cid), climate, et0, years=2 if CROPS[cid].plant_doy + CROPS[cid].season_days > DAYS_PER_YEAR else 1, **kwargs)
        out[cid] = float(np.mean(o.water_factor * o.heat_factor))
    return out
