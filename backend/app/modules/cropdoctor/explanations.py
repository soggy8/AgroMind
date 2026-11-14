"""Cautious findings: what the greenness run and the weather say, never a diagnosis. Pure."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

from .anomalies import Scored, current_run, fall_before, status
from .indicators.vegetation import period_start
from .indicators.weather import WeatherValue
from .parameters import DRY_MAX_YEARS_DRIER, HOT_MIN_DELTA_C, SUDDEN_FALL_NDVI

CAVEAT = "Satellites can't rule out pests or disease."


@dataclass(frozen=True)
class Explanation:
    id: str
    text: str
    check: str


@dataclass(frozen=True)
class Finding:
    severity: str
    headline: str
    since: date
    summary: str
    explanations: tuple[Explanation, ...]
    caveat: str
    run: tuple[Scored, ...]


SUDDEN = Explanation(
    "sudden_event", "A sudden event such as a storm, hail or cutting may be one explanation.",
    "Walk the field and look for flattened, torn or cut plants.")
WATER = Explanation(
    "water_stress", "Water stress may be one explanation.",
    "Dig to 15 cm in a few places across the field and feel whether the soil is dry.")
UNEXPLAINED = Explanation(
    "unexplained", "The weather doesn't explain this.",
    "Walk the field and look closely at leaves and roots; a local agronomist can tell pests, "
    "disease and nutrient problems apart.")
_HEADLINES = {"sudden_event": "Sudden drop in greenness", "water_stress": "Possible water stress",
              "unexplained": "Greenness below normal"}


def find(scored: Sequence[Scored], weather: Mapping[str, WeatherValue]) -> Finding | None:
    sev = status(scored)
    if sev not in ("watch", "alert"):
        return None
    run = current_run(scored)
    fall = fall_before(scored, run)
    sudden = fall is not None and fall >= SUDDEN_FALL_NDVI
    rain, tmax = weather.get("rain_mm"), weather.get("tmax_c")
    dry = (rain is not None and rain.years_below is not None and rain.diff is not None
           and rain.years_below <= DRY_MAX_YEARS_DRIER and rain.diff < 0)
    hot = tmax is not None and tmax.diff is not None and tmax.diff >= HOT_MIN_DELTA_C
    expl = tuple(e for e, on in ((SUDDEN, sudden), (WATER, dry)) if on) or (UNEXPLAINED,)
    latest = [s for s in run if s.diff_pct is not None][-1]
    summary = f"Greenness is {abs(latest.diff_pct):.0f}% below this field's normal"
    if dry:
        summary += f" while rain ran {abs(rain.diff):.0f}% short"
    if hot:
        summary += f"{' and' if dry else ' while'} daily highs ran {tmax.diff:.1f} °C above normal"
    return Finding(sev, _HEADLINES[expl[0].id], period_start(run[0].reading.year, run[0].reading.doy),
                   summary + ".", expl, CAVEAT, tuple(run))
