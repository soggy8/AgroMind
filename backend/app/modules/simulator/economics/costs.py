"""Per-season production cost."""
from __future__ import annotations

import numpy as np

from ..parameters import COVER_CROP_COST_USD_HA, CROPS, IRRIGATION_COST_USD_PER_MM_HA


def season_cost(crop_id: str, predecessor: str | None, irrigation_mm: np.ndarray, cover_crop: bool = False) -> np.ndarray:
    econ = CROPS[crop_id].economics
    if econ is None:
        raise KeyError(crop_id)
    base = econ.cost_after_self_usd_ha if (predecessor == crop_id and econ.cost_after_self_usd_ha) else econ.cost_usd_ha
    return base + IRRIGATION_COST_USD_PER_MM_HA * irrigation_mm + (COVER_CROP_COST_USD_HA if cover_crop else 0.0)
