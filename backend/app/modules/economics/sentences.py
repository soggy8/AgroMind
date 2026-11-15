"""Rule-generated sentences, from the numbers in one report only. Units change the text, never the API.

Standard library and `.parameters` / `.money` only. The wording stays cautious: "about", change
versus today's climate, and never a forecast.
"""
from __future__ import annotations

from .money import SwitchPoints
from .parameters import ACRES_PER_HA

CAVEAT = ("Compare rotations rather than reading single numbers: the model's year-to-year skill is weak, "
          "so these are scenario margins, not forecasts.")
NOT_CALIBRATED = ("This field is outside the area the yield model was calibrated for, so treat the money "
                  "figures as rough.")
OWN_LAND = "You own the land, so margin here is what's left to pay for the land and your management."
RENT_LAND = "Costs include cash rent and labour, so margin is the return to management."


def money(usd_ha: float, units: str) -> str:
    if units == "us":
        return f"${round(abs(usd_ha) / ACRES_PER_HA):,}/ac"
    return f"${round(abs(usd_ha)):,}/ha"


def scenario_label(temp_delta_c: float, rain_change_pct: float, projection_label: str | None) -> str:
    if projection_label:
        return projection_label
    return f"{temp_delta_c:+g} °C, {rain_change_pct:+g}% rain"


def climate_bill(yours: str, label: str, change_p50: float, alt: str | None, wins_back: float | None,
                 share: float | None, units: str) -> str:
    head = f"In this scenario ({label}), {yours} earns about"
    if abs(change_p50) < 0.5:
        return f"{head} the same as in today's climate."
    if change_p50 < 0:
        s = f"{head} {money(change_p50, units)} a year less than in today's climate."
        if alt is None or wins_back is None or wins_back <= 0:
            return s + " None of the other rotations earns more in this scenario."
        if share is not None and share > 1:
            return s + f" Switching to {alt} more than makes up for it."
        pct = f" ({share:.0%})" if share is not None else ""
        return s + f" Switching to {alt} wins back about {money(wins_back, units)} of that{pct}."
    s = f"{head} {money(change_p50, units)} a year more than in today's climate."
    if alt is not None and wins_back is not None and wins_back > 0:
        s += f" {alt} would earn about {money(wins_back, units)} a year more still."
    return s


def bad_years(name: str, losing_share: float, worst: float, cushion_worst: float, units: str) -> str:
    if losing_share == 0:
        return f"{name} made money in every simulated season."
    tenths = max(1, round(losing_share * 10))
    how_often = ("in every simulated season" if losing_share == 1 else "in nearly every simulated season"
                 if tenths == 10 else f"in about {tenths} of every 10 seasons")
    s = f"{name} loses money {how_often}; the worst season loses {money(worst, units)}."
    if cushion_worst > 0:
        s += f" Getting through the worst run of seasons takes about {money(cushion_worst, units)} in cash."
    return s


def _warming(pair: tuple[float, float]) -> str:
    a, b = pair
    return f"between {a:+g} °C and {b:+g} °C"


def _price(pair: tuple[float, float]) -> str:
    x, y = pair
    return f"between {abs(x):g}% and {abs(y):g}%"


def switch(sp: SwitchPoints, names: dict[str, str], yours: str) -> str:
    y = names.get(yours, yours)
    if sp.origin_winner is None:
        return f"In today's climate at today's prices, {y} and the next rotation are too close to call."
    if sp.origin_winner != yours:
        other = names.get(sp.origin_winner, sp.origin_winner)
        return f"Even in today's climate at today's prices, {other} earns more than {y}."
    if sp.wins_everywhere:
        return f"{y} earns most everywhere on this grid."
    if sp.warming_switch and sp.price_switch:
        return (f"{y} stops earning most {_warming(sp.warming_switch)} at today's prices, "
                f"or when prices fall {_price(sp.price_switch)}.")
    if sp.warming_switch:
        return f"{y} stops earning most {_warming(sp.warming_switch)} at today's prices."
    if sp.price_switch:
        return f"In today's climate, {y} stops earning most when prices fall {_price(sp.price_switch)}."
    return f"{y} earns most at today's prices and climate; other rotations win elsewhere on the grid."
