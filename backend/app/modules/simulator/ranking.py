"""Score rotations against the farmer's priorities and write the recommendation.

Every indicator is put on a fixed 0-1 scale (not min-max across the options, which would turn a
1% gap into a 0-vs-1 difference). Text is generated from the numbers in the result only.
"""
from __future__ import annotations

from . import units as u
from .schemas import IndicatorId, Priorities, Recommendation, RotationResult

NEAR_TIE = 0.03

INDICATOR_LABEL: dict[str, str] = {
    "yield": "yield", "water": "water self-sufficiency", "risk": "low risk of poor seasons",
    "soil": "soil health", "margin": "margin",
}


def indicator_scores(r: RotationResult, include_margin: bool) -> dict[IndicatorId, float]:
    scores: dict[IndicatorId, float] = {
        "yield": _clip((r.relative_yield.p50 - 0.5) / 0.6),      # 50% of typical -> 0, 110% -> 1
        "water": _clip(r.rain_sufficiency.p50),                   # share of need met without irrigation
        "risk": _clip(1 - r.stress_season_frequency),
        "soil": r.soil.score / 100,
    }
    if include_margin and r.economics is not None:
        scores["margin"] = _clip(0.5 + r.economics.margin_per_ha.p50 / 1500)  # -$750/ha -> 0, +$750/ha -> 1
    return scores


def weights(priorities: Priorities, include_margin: bool) -> dict[IndicatorId, float]:
    raw = {"yield": priorities.yield_, "water": priorities.water, "risk": priorities.risk,
           "soil": priorities.soil, "margin": priorities.margin if include_margin else 0.0}
    total = sum(raw.values()) or 1.0
    return {k: v / total for k, v in raw.items()}  # type: ignore[misc]


def rank(results: list[RotationResult], priorities: Priorities, include_margin: bool,
         units: u.Units = "metric") -> tuple[list[RotationResult], Recommendation]:
    margin_ok = include_margin and all(r.economics is not None for r in results)
    w = weights(priorities, margin_ok)
    for r in results:
        r.indicator_scores = indicator_scores(r, margin_ok)
        r.score = round(sum(w[k] * v for k, v in r.indicator_scores.items()), 4)
    ordered = sorted(results, key=lambda r: (-r.score, r.input_index))
    for i, r in enumerate(ordered, start=1):
        r.rank = i
    return ordered, _recommend(ordered, w, units)


def _recommend(ordered: list[RotationResult], w: dict[IndicatorId, float], units: u.Units) -> Recommendation:
    best = ordered[0]
    near_tie = len(ordered) > 1 and best.score - ordered[1].score < NEAR_TIE
    if len(ordered) == 1:
        headline = f"{best.name}: results for this scenario"
    elif near_tie:
        headline = f"Too close to call between {best.name} and {ordered[1].name}"
    else:
        headline = f"{best.name} fits your priorities best in this scenario"

    reasons = _reasons(best, ordered, w, units)
    if best.vs_baseline.relative_yield_change_pct <= -1:
        reasons.append(f"Its yield falls {abs(best.vs_baseline.relative_yield_change_pct):.0f}% against today's climate, "
                       f"{_compare_drop(best, ordered)}")

    trade_offs = []
    for k in best.indicator_scores:
        if w[k] == 0 or len(ordered) == 1:
            continue
        rival = max(ordered[1:], key=lambda r: r.indicator_scores.get(k, 0))
        if rival.indicator_scores.get(k, 0) - best.indicator_scores[k] > 0.025:
            unit = "per year" if k == "margin" else TRADE_OFF_UNIT[k]
            trade_offs.append(f"{rival.name} does better on {INDICATOR_LABEL[k]}: "
                              f"{_value(rival, k, units)} against {_value(best, k, units)} {unit}")
    return Recommendation(rotation_id=best.rotation_id, headline=headline, reasons=reasons,
                          trade_offs=trade_offs, near_tie=near_tie)


def _reasons(best: RotationResult, ordered: list[RotationResult], w: dict[IndicatorId, float],
             units: u.Units = "metric") -> list[str]:
    """Up to two reasons: where the winner actually beats the alternatives, weighted by priority.

    With one rotation, or when it wins on no single indicator, describe its strongest points instead.
    """
    rivals = ordered[1:]
    edges = []
    for k, v in best.indicator_scores.items():
        if w[k] == 0 or not rivals:
            continue
        runner_up = max(rivals, key=lambda r: r.indicator_scores.get(k, 0))
        edge = v - runner_up.indicator_scores.get(k, 0)
        if edge > 0.005:
            edges.append((w[k] * edge, k, runner_up))
    edges.sort(key=lambda e: e[0], reverse=True)
    if edges:
        return [f"{_describe(best, k, units)}, against {_value(r, k, units)} for {r.name}" for _, k, r in edges[:2]]
    contributions = sorted(((w[k] * v, k) for k, v in best.indicator_scores.items() if w[k] > 0), reverse=True)
    return [_describe(best, k, units) for _, k in contributions[:2]]


def _compare_drop(best: RotationResult, ordered: list[RotationResult]) -> str:
    if len(ordered) == 1:
        return "using the same weather years without the scenario"
    drops = [r.vs_baseline.relative_yield_change_pct for r in ordered]
    if max(drops) - min(drops) < 1.5:
        return "about the same as the other options"
    worst = min(ordered, key=lambda r: r.vs_baseline.relative_yield_change_pct)
    if worst is best:
        return "the largest drop of the options compared"
    return f"against {abs(worst.vs_baseline.relative_yield_change_pct):.0f}% for {worst.name}"


def _value(r: RotationResult, k: str, units: u.Units = "metric") -> str:
    """Short value for side-by-side trade-off text."""
    if k == "yield":
        return f"{r.relative_yield.p50 * 100:.0f}%"
    if k == "water":
        return f"{r.rain_sufficiency.p50 * 100:.0f}%"
    if k == "risk":
        return f"{r.stress_season_frequency * 100:.0f}%"
    if k == "soil":
        return f"{r.soil.score}"
    if k == "margin" and r.economics:
        return u.money_per_area(r.economics.margin_per_ha.p50, units)
    return ""


TRADE_OFF_UNIT = {"yield": "of typical yield", "water": "of water need met without irrigation",
                  "risk": "of seasons poor", "soil": "out of 100", "margin": "per ha per year"}


def _describe(r: RotationResult, k: str, units: u.Units = "metric") -> str:
    if k == "yield":
        return f"Highest yield, {r.relative_yield.p50 * 100:.0f}% of typical"
    if k == "water":
        irrigation = (f" (plus {u.water(r.irrigation_mm_per_year.p50, units)} a year of irrigation)"
                      if r.irrigation_mm_per_year.p50 >= 1 else "")
        return f"Rain and stored soil water cover more of its water need, {r.rain_sufficiency.p50 * 100:.0f}%{irrigation}"
    if k == "risk":
        return f"Fewest poor seasons (below 70% of typical yield), {r.stress_season_frequency * 100:.0f}%"
    if k == "soil":
        return (f"Best soil index, {r.soil.score}/100: {r.soil.notes[0].split(':')[0].lower()}"
                + (", including a legume" if r.soil.components.get("legume") else ""))
    if k == "margin" and r.economics:
        return (f"Best margin after all costs including land rent, "
                f"{u.money_per_area(r.economics.margin_per_ha.p50, units)} per year")
    return ""


def _clip(x: float) -> float:
    return round(max(0.0, min(1.0, float(x))), 4)
