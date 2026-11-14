"""The field's own normal greenness for a period. Pure."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from .parameters import MIN_NORMAL_YEARS, NORMAL_YEARS


@dataclass(frozen=True)
class Normal:
    mean: float
    low: float
    high: float
    years: tuple[int, ...]
    values: tuple[float, ...]     # aligned with years


def normal(by_year: Mapping[int, float | None], year: int) -> Normal | None:
    """Normal from the years year-NORMAL_YEARS .. year-1 that have a value."""
    years = tuple(y for y in range(year - NORMAL_YEARS, year) if by_year.get(y) is not None)
    if len(years) < MIN_NORMAL_YEARS:
        return None
    values = tuple(float(by_year[y]) for y in years)
    return Normal(sum(values) / len(values), min(values), max(values), years, values)
