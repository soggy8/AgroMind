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


def _rounds_to_zero(usd_ha: float, units: str) -> bool:
    return money(usd_ha, units) in ("$0/ha", "$0/ac")


def climate_bill(yours: str, label: str, change_p50: float, alt: str | None,
                 wins_back: float | None, share: float | None, units: str) -> str:
    head = f"In this scenario ({label}), {yours} earns about "
    if _rounds_to_zero(change_p50, units):
        return f"{head}the same as in today's climate."
    if change_p50 < 0:
        out = f"{head}{money(change_p50, units)} a year less than in today's climate."
        if alt is None:
            return out + " There's no other priced rotation to compare."
        if wins_back is not None and wins_back > 0 and share is not None:
            if share <= 1:
                return out + f" Switching to {alt} wins back about {money(wins_back, units)} of that ({share:.0%})."
            return out + f" Switching to {alt} more than makes up for it."
        return out + " None of the other rotations earns more in this scenario."
    out = f"{head}{money(change_p50, units)} a year more than in today's climate."
    if alt is not None and wins_back is not None and wins_back > 0 and not _rounds_to_zero(wins_back, units):
        out += f" {alt} would earn about {money(wins_back, units)} a year more still."
    return out


def bad_years(name: str, losing_share: float, worst: float, cushion_worst: float, units: str) -> str:
    if losing_share == 0:
        return f"{name} made money in every simulated season."
    how_often = ("every simulated season" if losing_share >= 1 else
                 f"about {min(9, max(1, round(losing_share * 10)))} of every 10 simulated seasons")
    out = f"{name} loses money in {how_often}; the worst season loses {money(worst, units)}."
    if cushion_worst > 0:
        out += f" Getting through the worst run of seasons takes about {money(cushion_worst, units)} in cash."
    return out


# ---------- who earns most: the grid's anchor cell, named exactly ----------

def _rain(rain_change_pct: float) -> str:
    return f"{abs(rain_change_pct):g}% {'less' if rain_change_pct < 0 else 'more'} rain"


def _climate(warming_c: float, rain_change_pct: float) -> str:
    """The anchor row's climate. "Today's climate" only when it is: no warming and no rain change."""
    if warming_c == 0:
        return "today's climate" if rain_change_pct == 0 else f"today's temperatures with {_rain(rain_change_pct)}"
    out = f"a climate {warming_c:+g} °C from today"
    return out if rain_change_pct == 0 else f"{out} with {_rain(rain_change_pct)}"


def _prices(price_change_pct: float, crop: str | None) -> str:
    """The anchor column's prices. "Today's prices" only when the change is 0."""
    noun = f"{crop} prices" if crop else "prices"
    if price_change_pct == 0:
        return f"today's {noun}"
    return f"{noun} {abs(price_change_pct):g}% {'lower' if price_change_pct < 0 else 'higher'}"


def _warming_clause(sp: SwitchPoints, rain_change_pct: float) -> str:
    a, b = sp.warming_switch  # type: ignore[misc]
    if sp.warming_tie_from is None:
        out = f"stops earning most between {a:+g} °C and {b:+g} °C"
    else:
        out = f"is too close to call from {sp.warming_tie_from:+g} °C and stops earning most by {b:+g} °C"
    return out if rain_change_pct == 0 else f"{out} with {_rain(rain_change_pct)}"


def _price_clause(sp: SwitchPoints, crop: str | None) -> tuple[str, str]:
    """(clause, the same clause after "or"). Prices fall from the anchor column, which may sit above 0."""
    x, z = sp.price_switch  # type: ignore[misc]
    noun = f"{crop} prices" if crop else "prices"
    if sp.price_tie_from is not None:
        out = (f"is too close to call when {noun} fall {abs(sp.price_tie_from):g}% "
               f"and stops earning most when they fall {abs(z):g}%")
        return out, out
    when = (f"when {noun} fall between {abs(x):g}% and {abs(z):g}%" if x <= 0 else
            f"when {noun} are between {x:g}% higher and {abs(z):g}% lower")
    return f"stops earning most {when}", when


def switch(sp: SwitchPoints, names: dict[str, str], yours: str, *, warming_c: float, rain_change_pct: float,
           price_change_pct: float, price_crop: str | None) -> str:
    """The who-earns-most sentence. `warming_c` and `price_change_pct` are the anchor row and column,
    `rain_change_pct` the grid rows' rain change, `price_crop` the crop's display name or None (all crops)."""
    y = names[yours]
    climate, prices = _climate(warming_c, rain_change_pct), _prices(price_change_pct, price_crop)
    if sp.origin_winner is None:
        return f"In {climate} at {prices}, {y} and the next rotation are too close to call."
    if sp.origin_winner != yours:
        return f"Even in {climate} at {prices}, {names[sp.origin_winner]} earns more than {y}."
    warming = _warming_clause(sp, rain_change_pct) if sp.warming_switch is not None else None
    price = _price_clause(sp, price_crop) if sp.price_switch is not None else None
    if warming and price:
        return f"{y} {warming} at {prices}, or {price[1]} in {climate}."
    if warming:
        return f"{y} {warming} at {prices}."
    if price:
        return f"In {climate}, {y} {price[0]}."
    if sp.wins_everywhere:
        return f"{y} earns most everywhere on this grid."
    if not sp.others_win_somewhere:
        return f"{y} earns most or is too close to call everywhere on this grid."
    return f"{y} earns most in {climate} at {prices}; other rotations win elsewhere on the grid."
