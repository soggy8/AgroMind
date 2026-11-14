"""Crop rules: the FAO-56 Kc curve and the three yield factors."""
from __future__ import annotations

import numpy as np

from ..parameters import HEAT_LOSS_CAP, HEAT_LOSS_PER_DEGDAY, CropParams


def kc_on_day(crop: CropParams, days_after_planting) -> np.ndarray:
    """Crop coefficient on a given day of the season (FAO-56 Fig. 25, four-stage curve)."""
    d = np.asarray(days_after_planting, dtype=float)
    ini, dev, mid, late = crop.stages
    kc_ini, kc_mid, kc_end = crop.kc
    rising = kc_ini + (kc_mid - kc_ini) * (d - ini) / dev
    falling = kc_mid + (kc_end - kc_mid) * (d - ini - dev - mid) / late
    return np.select(
        [d < ini, d < ini + dev, d < ini + dev + mid],
        [kc_ini, rising, kc_mid],
        default=np.maximum(falling, kc_end),
    )


def stage_on_day(crop: CropParams, days_after_planting: int) -> str:
    ini, dev, mid, _ = crop.stages
    if days_after_planting < ini:
        return "initial"
    if days_after_planting < ini + dev:
        return "development"
    if days_after_planting < ini + dev + mid:
        return "mid"
    return "late"


def is_mid_season(crop: CropParams, days_after_planting) -> np.ndarray:
    ini, dev, mid, _ = crop.stages
    d = np.asarray(days_after_planting)
    return (d >= ini + dev) & (d < ini + dev + mid)


def water_factor(crop: CropParams, eta_mm, etc_mm) -> np.ndarray:
    """FAO-56 Eq. 90 rearranged: Ya/Ym = 1 - Ky (1 - ETa/ETc), clipped to [0, 1]."""
    ratio = np.asarray(eta_mm, float) / np.maximum(np.asarray(etc_mm, float), 1e-9)
    return np.clip(1 - crop.ky * (1 - ratio), 0.0, 1.0)


def heat_factor(heat_degree_days, loss_per_degday: float = HEAT_LOSS_PER_DEGDAY,
                cap: float = HEAT_LOSS_CAP) -> np.ndarray:
    """Yield share left after mid-season heat: 1 - min(cap, loss x degree-days above Tcrit)."""
    return 1 - np.minimum(cap, loss_per_degday * np.asarray(heat_degree_days, float))


def rotation_factor(crop: CropParams, predecessor_crop_id: str | None) -> float:
    return crop.monoculture_factor if predecessor_crop_id == crop.id else 1.0
