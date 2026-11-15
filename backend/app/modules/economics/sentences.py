"""Rule-generated plain-language sentences for the economics report.

Pure functions: no I/O. Wording is cautious ("about") and never calls a margin a
prediction. Money follows `units`: "metric" gives $/ha, "us" gives $/ac.
"""
from __future__ import annotations

from .money import SwitchPoints
from .parameters import ACRES_PER_HA

CAVEAT = ("Compare rotations rather than reading single numbers: the model's year-to-year "
          "skill is weak, so these are scenario margins, not forecasts.")
NOT_CALIBRATED = ("This field is outside the area the yield model was calibrated for, "
                  "so treat the money figures as rough.")
OWN_LAND = "You own the land, so margin here is what's left to pay for the land and your management."
RENT_LAND = "Costs include cash rent and labour, so margin is the return to management."


def money(usd_ha: float, units: str) -> str:
    """Absolute value as $/ha (metric) or $/ac (us); callers phrase direction in words."""
    if units == "us":
        return f"${round(abs(usd_ha) / ACRES_PER_HA):,}/ac"
    return f"${round(abs(usd_ha)):,}/ha"


def scenario_label(temp_delta_c: float, rain_change_pct: float, projection_label: str | None) -> str:
    if projection_label:
        return projection_label
    return f"{temp_delta_c:+g} °C, {rain_change_pct:+g}% rain"


def climate_bill(yours: str, label: str, change_p50: float, alt: str | None,
                 wins_back: float | None, share: float | None, units: str) -> str:
    head = f"In this scenario ({label}), {yours} earns about "
    if abs(change_p50) < 0.5:
        return f"{head}the same as in today's climate."
    if change_p50 < 0:
        out = f"{head}{money(change_p50, units)} a year less than in today's climate."
        if alt is not None and wins_back is not None and wins_back > 0 and share is not None:
            if share <= 1:
                return out + f" Switching to {alt} wins back about {money(wins_back, units)} of that ({share:.0%})."
            return out + f" Switching to {alt} more than makes up for it."
        return out + " None of the other rotations earns more in this scenario."
    out = f"{head}{money(change_p50, units)} a year more than in today's climate."
    if alt is not None and wins_back is not None and wins_back > 0:
        out += f" {alt} would earn about {money(wins_back, units)} a year more still."
    return out


def bad_years(name: str, losing_share: float, worst: float, cushion_worst: float, units: str) -> str:
    if losing_share == 0:
        return f"{name} made money in every simulated season."
    out = (f"{name} loses money in about {max(1, round(losing_share * 10))} of every 10 seasons; "
           f"the worst season loses {money(worst, units)}.")
    if cushion_worst > 0:
        out += f" Getting through the worst run of seasons takes about {money(cushion_worst, units)} in cash."
    return out


def switch(sp: SwitchPoints, names: dict[str, str], yours: str) -> str:
    y = names[yours]
    if sp.origin_winner is None:
        return f"In today's climate at today's prices, {y} and the next rotation are too close to call."
    if sp.origin_winner != yours:
        return f"Even in today's climate at today's prices, {names[sp.origin_winner]} earns more than {y}."
    warming = price = None
    if sp.warming_switch is not None:
        a, b = sp.warming_switch
        warming = f"between {a:+g} °C and {b:+g} °C"
    if sp.price_switch is not None:
        x, z = sp.price_switch
        price = f"between {abs(x):g}% and {abs(z):g}%"
    if warming and price:
        return f"{y} stops earning most {warming} at today's prices, or when prices fall {price}."
    if warming:
        return f"{y} stops earning most {warming} at today's prices."
    if price:
        return f"In today's climate, {y} stops earning most when prices fall {price}."
    if sp.wins_everywhere:
        return f"{y} earns most everywhere on this grid."
    return f"{y} earns most at today's prices and climate; other rotations win elsewhere on the grid."
