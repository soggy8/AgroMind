"""Pure money maths: season margins per weather track and the statistics built on them.

Standard library and numpy only. Shapes: `(n_seasons, n_tracks)` for season margins, `(n_tracks,)`
for per-track results. A track is one historical weather start year.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class MoneyInputs:
    price_usd_t: dict[str, float]
    typical_yield_t_ha: dict[str, float]
    cost_before_rent_usd_ha: dict[str, float]
    cost_after_self_before_rent_usd_ha: dict[str, float]
    rent_usd_ha: float
    irrigation_usd_per_mm_ha: float
    cover_crop_usd_ha: float


@dataclass(frozen=True)
class P3:
    p10: float
    p50: float
    p90: float


@dataclass(frozen=True)
class SwitchPoints:
    origin_winner: str | None
    warming_switch: tuple[float, float] | None
    price_switch: tuple[float, float] | None
    wins_everywhere: bool


def season_margins(crops: Sequence[str], first_predecessor: str | None, track_yields: np.ndarray,
                   irrigation_mm: Sequence[float], cover_crop: bool, m: MoneyInputs,
                   price_change_pct: float = 0.0, price_crop: str | None = None) -> np.ndarray:
    """margin = yield x typical yield x price x (1 + shift) - (cost + rent + irrigation + cover crop)."""
    out = np.empty(track_yields.shape, dtype=float)
    predecessor = first_predecessor
    for s, crop in enumerate(crops):
        shifted = price_crop is None or price_crop == crop
        # (100 + shift) / 100 applied to the price first keeps round shifts exact in floating point
        price = m.price_usd_t[crop] * (100.0 + price_change_pct) / 100.0 if shifted else m.price_usd_t[crop]
        after_self = m.cost_after_self_before_rent_usd_ha.get(crop)
        cost_before = after_self if (predecessor == crop and after_self is not None) else m.cost_before_rent_usd_ha[crop]
        cost = cost_before + m.rent_usd_ha + m.irrigation_usd_per_mm_ha * irrigation_mm[s]
        if cover_crop:
            cost += m.cover_crop_usd_ha
        out[s] = track_yields[s] * m.typical_yield_t_ha[crop] * price - cost
        predecessor = crop
    return out


def annual_margins(season_margins: np.ndarray, years: int) -> np.ndarray:
    return season_margins.sum(axis=0) / years


def p3(values: np.ndarray) -> P3:
    p10, p50, p90 = np.percentile(values, [10, 50, 90])
    return P3(float(p10), float(p50), float(p90))


def cash_cushion(season_margins: np.ndarray) -> np.ndarray:
    """Cash needed at the start so the running total never goes negative, per track."""
    return np.maximum(0.0, -np.cumsum(season_margins, axis=0).min(axis=0))


def losing_season_share(season_margins: np.ndarray) -> float:
    return float((season_margins < 0).mean())


def losing_runs(season_margins: np.ndarray) -> int:
    return int((season_margins.sum(axis=0) < 0).sum())


def grid_winner(p50_by_rotation: dict[str, float], near_tie_usd_ha: float) -> tuple[str | None, bool]:
    """(winner, near_tie). The top two within the near-tie margin give no winner."""
    ranked = sorted(p50_by_rotation.items(), key=lambda kv: kv[1], reverse=True)
    if len(ranked) == 1:
        return ranked[0][0], False
    if ranked[0][1] - ranked[1][1] < near_tie_usd_ha:
        return None, True
    return ranked[0][0], False


def _nearest_zero(values: Sequence[float]) -> int:
    return min(range(len(values)), key=lambda i: abs(values[i]))


def switch_points(winners: list[list[str | None]], warming_c: Sequence[float], price_pct: Sequence[float],
                  yours: str) -> SwitchPoints:
    """Where `yours` stops earning most. Rows are warming levels, columns price changes. Near ties are skipped."""
    r0, c0 = _nearest_zero(warming_c), _nearest_zero(price_pct)
    origin = winners[r0][c0]
    everywhere = all(w == yours for row in winners for w in row)
    if origin != yours:
        return SwitchPoints(origin, None, None, everywhere)
    warming_switch = None
    for r in range(r0 + 1, len(warming_c)):
        if winners[r][c0] not in (None, yours):
            warming_switch = (warming_c[r - 1], warming_c[r])
            break
    price_switch = None
    for c in range(c0 - 1, -1, -1):
        if winners[r0][c] not in (None, yours):
            price_switch = (price_pct[c + 1], price_pct[c])
            break
    return SwitchPoints(origin, warming_switch, price_switch, everywhere)
