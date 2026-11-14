"""Daily root-zone water balance (FAO-56 chapter 8). Vectorised over ensemble tracks.

State is the depletion *fraction* of total available water (0 = field capacity, 1 = wilting
point), so it carries across crop changes when the rooting depth, and so TAW, changes.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class DayFluxes:
    etc: np.ndarray
    eta: np.ndarray
    irrigation: np.ndarray
    drainage: np.ndarray


def stress_coefficient(depletion_mm, taw_mm, p) -> np.ndarray:
    """Ks (FAO-56 Eq. 84): 1 while depletion <= RAW, then falls linearly to 0 at TAW."""
    depletion_mm = np.asarray(depletion_mm, float)
    raw = p * taw_mm
    ks = (taw_mm - depletion_mm) / np.maximum((1 - p) * taw_mm, 1e-9)
    return np.clip(np.where(depletion_mm <= raw, 1.0, ks), 0.0, 1.0)


def step(depletion_frac: np.ndarray, *, et0: np.ndarray, kc: float, rain: np.ndarray, taw: float,
         p: float, in_season: bool, irrigate: bool, irrigation_left: np.ndarray | None,
         fallow_kc: float) -> tuple[np.ndarray, DayFluxes]:
    """Advance one day. Returns the new depletion fraction and the day's fluxes (all mm).

    In season: irrigation first (if allowed and depletion is past RAW, refill to field capacity,
    limited by `irrigation_left`), then ETa = Ks x Kc x ET0.
    Out of season: soil evaporation = fallow Kc x ET0, scaled down as the soil dries.
    Rain refills the root zone; anything above field capacity drains away.
    """
    dr = depletion_frac * taw
    zeros = np.zeros_like(dr)
    irrigation = zeros
    if in_season:
        if irrigate:
            need = np.where(dr > p * taw, dr, 0.0)
            irrigation = need if irrigation_left is None else np.minimum(need, irrigation_left)
            dr = dr - irrigation
        etc = kc * et0
        eta = stress_coefficient(dr, taw, p) * etc
    else:
        etc = zeros
        eta = fallow_kc * et0 * (1 - dr / taw)
    dr = dr - rain + eta
    drainage = np.maximum(-dr, 0.0)
    dr = np.clip(dr, 0.0, taw)
    return dr / taw, DayFluxes(etc=etc, eta=eta, irrigation=irrigation, drainage=drainage)
