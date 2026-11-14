"""Units for generated text. All numbers in API responses stay metric; only sentences change."""
from __future__ import annotations

from typing import Literal

Units = Literal["metric", "us"]
MM_PER_INCH = 25.4
HA_PER_ACRE = 0.40468564


def water(mm: float, units: Units) -> str:
    return f"{mm / MM_PER_INCH:.1f} in" if units == "us" else f"{mm:.0f} mm"


def money_per_area(usd_per_ha: float, units: Units) -> str:
    v = usd_per_ha * HA_PER_ACRE if units == "us" else usd_per_ha
    return f"{'-' if v < 0 else ''}${abs(v):,.0f}/{'ac' if units == 'us' else 'ha'}"
