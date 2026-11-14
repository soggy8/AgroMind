"""Per-season revenue."""
from __future__ import annotations

import numpy as np

from ..parameters import CROPS


def season_revenue(crop_id: str, relative_yield: np.ndarray, price_change_pct: float) -> np.ndarray:
    crop = CROPS[crop_id]
    if crop.economics is None or crop.typical_yield_t_ha is None:
        raise KeyError(crop_id)
    return relative_yield * crop.typical_yield_t_ha * crop.economics.price_usd_t * (1 + price_change_pct / 100)


def has_economics(crop_id: str) -> bool:
    c = CROPS[crop_id]
    return c.economics is not None and c.typical_yield_t_ha is not None
