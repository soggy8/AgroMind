"""Hand-off to the AI advisor (shared/advisor, owned by another teammate).

`advisor_context(result)` turns a SimulationResult into a short list of facts with numbers and
their kind. The advisor should answer only from these facts and say when a question goes beyond them.
"""
from __future__ import annotations

from .parameters import CROPS
from .schemas import AdvisorContext, SimulationResult

INSTRUCTIONS = (
    "You are explaining the output of a crop rotation simulator to a farmer. Use only the facts listed. "
    "Every number is MODELLED (an estimate from a simple crop water model), OBSERVED (NASA POWER weather) or "
    "SCENARIO (a hypothetical input). Say which. The scenario is a uniform shift of past weather, not a forecast. "
    "If a question needs information that is not in the facts, say so and suggest a field check or a local advisor."
)


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def advisor_context(r: SimulationResult) -> AdvisorContext:
    s = r.scenario
    facts = [
        f"Field: {r.field_name}, soil {r.soil}. Simulated {s.years} years, repeated over {r.ensemble_size} historical "
        f"weather years ({r.ensemble_start_years[0]}-{r.ensemble_start_years[-1]}).",
        f"SCENARIO: temperature {s.temp_delta_c:+.1f} C, rainfall {s.rain_change_pct:+.0f}%, irrigation {s.irrigation}"
        + (f" (cap {s.irrigation_cap_mm:.0f} mm/season)" if s.irrigation == "limited" else "") + ".",
        f"OBSERVED climate May-Sep: {r.baseline_climate.growing_season_rain_mm:.0f} mm rain, mean max temperature "
        f"{r.baseline_climate.growing_season_tmax_c:.1f} C, {r.baseline_climate.hot_days_per_year:.1f} days at or above 35 C per year "
        f"({r.baseline_climate.source}).",
        f"SCENARIO climate May-Sep: {r.scenario_climate.growing_season_rain_mm:.0f} mm rain, mean max temperature "
        f"{r.scenario_climate.growing_season_tmax_c:.1f} C, {r.scenario_climate.hot_days_per_year:.1f} hot days per year.",
    ]
    for rot in r.rotations:
        line = (f"MODELLED, rank {rot.rank}: {rot.name}. Yield {_pct(rot.relative_yield.p50)} of typical "
                f"(p10-p90 {_pct(rot.relative_yield.p10)}-{_pct(rot.relative_yield.p90)}), "
                f"{rot.vs_baseline.relative_yield_change_pct:+.0f}% against today's climate. "
                f"Poor seasons {_pct(rot.stress_season_frequency)}. Water need met by rain and soil water {_pct(rot.rain_sufficiency.p50)}. "
                f"Irrigation {rot.irrigation_mm_per_year.p50:.0f} mm/year. Soil index {rot.soil.score}/100.")
        if rot.economics:
            m = rot.economics.margin_per_ha.p50
            line += f" Margin {'-' if m < 0 else ''}${abs(m):,.0f}/ha/year after land rent."
        limiting = {s.limiting_factor for s in rot.seasons} - {"none"}
        if limiting:
            line += f" Main limits: {', '.join(sorted(limiting))}."
        facts.append(line)
    facts.append(f"Recommendation: {r.recommendation.headline}. " + " ".join(r.recommendation.reasons))
    if r.recommendation.trade_offs:
        facts.append("Trade-offs: " + "; ".join(r.recommendation.trade_offs))
    facts.append(f"Data note: {r.data_note}")
    facts += [f"Assumption ({a.topic}): {a.text} [{a.source}]" for a in r.assumptions[:8]]

    crops = sorted({c for rot in r.rotations for c in rot.crops}, key=list(CROPS).index)
    questions = [
        f"Why does {r.rotations[0].name} rank first?",
        "Which rotation needs the least water in this scenario?",
        "How much do these results depend on the weather year?",
    ]
    if "soybean" in crops:
        questions.append("What does adding soybean do to the rotation?")
    return AdvisorContext(instructions=INSTRUCTIONS, facts=facts, suggested_questions=questions)
