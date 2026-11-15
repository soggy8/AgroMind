"""Fact list for the AI advisor (shared/advisor) from one FarmHealth.

The advisor may answer only from these facts. Each value says its kind (OBSERVED / MODELLED) and source.
"""
from __future__ import annotations

from .schemas import AdvisorContext, FarmHealth, Indicator

INSTRUCTIONS = (
    "You are explaining a farm's crop health check to a farmer. The facts come from NASA satellite greenness "
    "(MODIS NDVI) and NASA POWER weather, compared with the same dates in earlier years. Use only the facts listed "
    "and say whether a number is OBSERVED or MODELLED. Findings are possibilities, never diagnoses: say 'may', "
    "never 'detected', 'caused by' or 'confirmed', and say satellites can't rule out pests or disease. "
    "Recommend the field check named in the facts when it fits."
)


def _num(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".") if abs(x) < 10 else f"{x:.0f}"


def _indicator(i: Indicator) -> str:
    v = i.value
    if v.value is None:
        return f"{i.label}: no data ({v.source})."
    unit = f" {v.unit}" if v.unit else ""
    s = f"{v.kind.upper()} {i.label}: {_num(v.value)}{unit}"
    if v.period_start and v.period_end:
        s += f" ({v.period_start:%d %b} to {v.period_end:%d %b %Y})"
    if v.normal is not None:
        s += f"; normal {_num(v.normal)}{unit}"
        if v.normal_low is not None and v.normal_high is not None:
            s += f" (range {_num(v.normal_low)}-{_num(v.normal_high)}"
            s += f" over {v.normal_years} years)" if v.normal_years else ")"
    if v.diff is not None:
        s += f"; {v.diff:+.1f}{v.diff_unit or ''} against normal"
    return s + f". Source: {v.source}."


def advisor_context(h: FarmHealth) -> AdvisorContext:
    when = f"{h.as_of:%d %b %Y}" + (" (a replay of a past date)" if h.is_replay else " (today)")
    facts = [f"Farm: {h.farm.name}" + (f", {h.farm.region}" if h.farm.region else "") + f". Health check as of {when}.",
             f"Data note: {h.data_note}"]
    if not h.greenness_available:
        facts.append("Satellite greenness isn't available for this farm yet, so field status can't be judged from it.")
    facts += [_indicator(w) for w in h.weather]

    for f in h.fields:
        line = f"{f.name}: {f.area_ha:.1f} ha, status {f.status.replace('_', ' ')}"
        if f.status_note:
            line += f" ({f.status_note})"
        if f.crop:
            line += (f". Crop {f.crop.label}" + (f" in {f.crop.year}" if f.crop.year else "")
                     + (f", {f.crop.kind.upper()}" if f.crop.kind else "") + f" ({f.crop.source})")
        soil = f.soil
        parts = [p for p in (soil.texture and soil.texture.replace("_", " "),
                             soil.sand_pct is not None and f"sand {soil.sand_pct:.0f}%",
                             soil.silt_pct is not None and f"silt {soil.silt_pct:.0f}%",
                             soil.clay_pct is not None and f"clay {soil.clay_pct:.0f}%",
                             soil.ph is not None and f"pH {soil.ph:.1f}") if p]
        if parts:
            line += f". Soil {soil.kind.upper()}: {', '.join(parts)}" + (f" at {soil.depth}" if soil.depth else "") \
                + (f" ({soil.source})" if soil.source else "")
        facts.append(line + ".")
        if f.greenness:
            facts.append(f"{f.name}, " + _indicator(f.greenness))

    if not h.findings:
        facts.append("Findings: none. The rules in the assumptions only flag greenness that is lower than usual; "
                     "no field met them. Greenness above normal is not flagged.")
    for x in h.findings:
        facts.append(f"Finding for {x.field_name} ({x.severity}), since {x.since:%d %b %Y}: {x.headline}. {x.summary} "
                     + " ".join(f"{e.text} Suggested check: {e.check}" for e in x.explanations) + f" {x.caveat}")
    facts += [f"Assumption ({a.topic}): {a.text} [{a.source}]" for a in h.assumptions]

    questions = []
    if h.findings:
        first = h.findings[0]
        questions += [f"Why is {first.field_name} flagged?", f"What should I check on {first.field_name} first?"]
    else:
        questions.append("Is anything on the farm outside its normal?")
    if h.weather:
        questions.append("How unusual is the recent weather?")
    questions.append("What can satellite greenness not tell me?")
    return AdvisorContext(instructions=INSTRUCTIONS, facts=facts, suggested_questions=questions)
