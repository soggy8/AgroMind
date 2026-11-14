"""Greenness readings and MODIS period dates. Pure."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from ..parameters import PERIOD_DAYS


@dataclass(frozen=True)
class Reading:
    year: int
    doy: int                 # period start day-of-year, taken from the MODIS item id
    ndvi: float | None       # field mean; None when no usable point
    satellite: str           # "Terra" or "Aqua"
    points_used: int
    points_total: int


def parse_item_id(item_id: str) -> tuple[int, int, str]:
    """`MOD13Q1.A2012193.h11v04...` -> (2012, 193, "Terra"); MYD is Aqua."""
    prefix, stamp = item_id.split(".")[:2]
    return int(stamp[1:5]), int(stamp[5:8]), "Terra" if prefix.startswith("MOD") else "Aqua"


def period_start(year: int, doy: int) -> date:
    return date(year, 1, 1) + timedelta(days=doy - 1)


def period_end(year: int, doy: int) -> date:
    return min(period_start(year, doy) + timedelta(days=PERIOD_DAYS - 1), date(year, 12, 31))


def visible_from(year: int, doy: int) -> date:
    return period_start(year, doy) + timedelta(days=PERIOD_DAYS)
