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
    """Where `yours` stops earning most, moving away from the anchor cell (the row and column nearest 0).

    A switch is (last value where yours wins outright, first value where another rotation wins). When
    near ties lie between the two, `*_tie_from` is the first tied value after that last win.
    """
    origin_winner: str | None
    warming_switch: tuple[float, float] | None
    price_switch: tuple[float, float] | None
    wins_everywhere: bool
    others_win_somewhere: bool
    warming_tie_from: float | None = None
    price_tie_from: float | None = None


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


def nearest_zero(values: Sequence[float]) -> int:
    """Index of the value nearest 0 (the first one on a tie): the grid's anchor row or column."""
    return min(range(len(values)), key=lambda i: abs(values[i]))


def _first_switch(line: list[str | None], values: Sequence[float], yours: str
                  ) -> tuple[tuple[float, float] | None, float | None]:
    """((last outright win, first win by another rotation), first tie after that win) along one line of cells.

    `line[0]` is the anchor cell, won by yours. None (a near tie) is neither a win nor a switch.
    """
    last_win, tie_from = 0, None
    for i in range(1, len(line)):
        if line[i] == yours:
            last_win, tie_from = i, None
        elif line[i] is None:
            tie_from = i if tie_from is None else tie_from
        else:
            return (values[last_win], values[i]), None if tie_from is None else values[tie_from]
    return None, None


def switch_points(winners: list[list[str | None]], warming_c: Sequence[float], price_pct: Sequence[float],
                  yours: str) -> SwitchPoints:
    """Where `yours` stops earning most: down the anchor column as it warms, left along the anchor row as
    prices fall. Rows are warming levels, columns price changes."""
    r0, c0 = nearest_zero(warming_c), nearest_zero(price_pct)
    origin = winners[r0][c0]
    cells = [w for row in winners for w in row]
    everywhere, others = all(w == yours for w in cells), any(w not in (None, yours) for w in cells)
    if origin != yours:
        return SwitchPoints(origin, None, None, everywhere, others)
    column = [winners[r][c0] for r in range(r0, len(warming_c))]
    warming_switch, warming_tie = _first_switch(column, list(warming_c[r0:]), yours)
    row = [winners[r0][c] for c in range(c0, -1, -1)]
    price_switch, price_tie = _first_switch(row, [price_pct[c] for c in range(c0, -1, -1)], yours)
    return SwitchPoints(origin, warming_switch, price_switch, everywhere, others, warming_tie, price_tie)
