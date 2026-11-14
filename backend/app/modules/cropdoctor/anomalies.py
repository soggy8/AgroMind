"""Low-greenness periods, runs of them and the field status. Pure."""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from .baselines import Normal, normal
from .indicators.vegetation import Reading, visible_from
from .parameters import (
    ALERT_DROP_PCT,
    CANOPY_MIN_NORMAL_NDVI,
    LOW_MAX_YEARS_BELOW,
    LOW_MIN_DROP_PCT,
    PERIOD_DAYS,
    RUN_LENGTH,
)


@dataclass(frozen=True)
class Scored:
    reading: Reading
    normal: Normal | None
    diff_pct: float | None
    years_below: int | None
    in_canopy: bool
    low: bool


def _score(reading: Reading, nrm: Normal | None) -> Scored:
    in_canopy = nrm is not None and nrm.mean >= CANOPY_MIN_NORMAL_NDVI
    if nrm is None or reading.ndvi is None:
        return Scored(reading, nrm, None, None, in_canopy, False)
    diff = (reading.ndvi - nrm.mean) / nrm.mean * 100
    below = sum(1 for v in nrm.values if v < reading.ndvi)
    low = in_canopy and diff <= -LOW_MIN_DROP_PCT and below <= LOW_MAX_YEARS_BELOW
    return Scored(reading, nrm, diff, below, in_canopy, low)


def score_season(readings: Sequence[Reading], year: int, as_of: date) -> list[Scored]:
    by_doy: dict[int, dict[int, float | None]] = {}
    for r in readings:
        by_doy.setdefault(r.doy, {})[r.year] = r.ndvi
    current = sorted((r for r in readings if r.year == year and visible_from(r.year, r.doy) <= as_of),
                     key=lambda r: r.doy)
    return [_score(r, normal(by_doy[r.doy], year)) for r in current]


def current_run(scored: Sequence[Scored]) -> list[Scored]:
    run: list[Scored] = []
    for s in reversed(scored):
        if s.reading.ndvi is None:
            continue
        if not s.low:
            break
        run.append(s)
    run.reverse()
    return run


def status(scored: Sequence[Scored]) -> str:
    valued = [s for s in scored if s.reading.ndvi is not None]
    if not valued or valued[-1].normal is None:
        return "no_data"
    if not valued[-1].in_canopy:
        return "paused"
    run = current_run(scored)
    if len(run) < RUN_LENGTH:
        return "normal"
    if any(s.diff_pct is not None and s.diff_pct <= -ALERT_DROP_PCT for s in run):
        return "alert"
    return "watch"


def fall_before(scored: Sequence[Scored], run: Sequence[Scored]) -> float | None:
    if not run or run[0].reading.ndvi is None:
        return None
    doy = run[0].reading.doy - PERIOD_DAYS
    for s in scored:
        if s.reading.doy == doy and s.reading.ndvi is not None:
            return s.reading.ndvi - run[0].reading.ndvi
    return None
