"""Fact list for the AI advisor (shared/advisor) from one farm profile.

Kinds follow docs/modules/croptwin.md: SoilGrids soil and boundary-computed areas are MODELLED; farmer-entered
soil, areas and yields are OBSERVED with the farmer as source.
"""
from __future__ import annotations

from .schemas import AdvisorContext, FarmOut, FieldOut, SoilLayerOut

INSTRUCTIONS = (
    "You are explaining a farm's profile to its farmer: the fields, soil and crop history they keep in AgroMind. "
    "Use only the facts listed and say whether a number is OBSERVED (entered by the farmer or a lab) or MODELLED "
    "(a mapped estimate such as SoilGrids, or an area computed from a drawn outline). The profile holds no crop "
    "health or yield forecast: for those, point to the Command Center (crop health from NASA satellites) or the "
    "Simulator (crop rotations under climate scenarios). If data is missing, say what to add to the profile."
)

CROP_NAMES = {"maize": "maize", "soybean": "soybean", "oats": "oats", "winter_wheat": "winter wheat",
              "sunflower": "sunflower"}


def _layer(l: SoilLayerOut) -> str:
    kind = "MODELLED" if "SoilGrids" in l.source else "OBSERVED"
    parts = [p for p in (l.sand_pct is not None and f"sand {l.sand_pct:.0f}%",
                         l.silt_pct is not None and f"silt {l.silt_pct:.0f}%",
                         l.clay_pct is not None and f"clay {l.clay_pct:.0f}%",
                         l.soc_g_kg is not None and f"organic carbon {l.soc_g_kg:.1f} g/kg",
                         l.ph is not None and f"pH {l.ph:.1f}") if p]
    return f"{l.depth_top_cm}-{l.depth_bottom_cm} cm {kind}: {', '.join(parts) or 'no values'} ({l.source})"


def _field(f: FieldOut) -> list[str]:
    area_kind = "MODELLED, computed from the drawn boundary" if f.area_source == "computed_from_boundary" \
        else "OBSERVED, stated by the farmer"
    line = (f"{f.name}: {f.area_ha:.1f} ha ({area_kind}), centre {f.centroid_lat:.3f}, {f.centroid_lon:.3f}. "
            f"Current crop: {CROP_NAMES.get(f.current_crop_id or '', 'not set')}. "
            f"Irrigation {'available' if f.irrigation_available else 'not available'}. "
            f"Soil texture class: {f.soil_texture.replace('_', ' ') if f.soil_texture else 'not set'}.")
    out = [line]
    layers = sorted(f.soil_layers, key=lambda l: l.depth_top_cm)
    out.append(f"{f.name} soil layers: " + "; ".join(_layer(l) for l in layers) + "."
               if layers else f"{f.name} has no soil layers recorded.")
    if f.crop_history:
        entries = []
        for h in sorted(f.crop_history, key=lambda h: h.season_year):
            e = f"{h.season_year} {CROP_NAMES.get(h.crop_id, h.crop_id)}"
            if h.yield_value is not None:
                e += f", yield {h.yield_value:g}{' ' + h.yield_unit if h.yield_unit else ''} OBSERVED ({h.source})"
            if h.notes:
                e += f", note: {h.notes}"
            entries.append(e)
        out.append(f"{f.name} crop history: " + "; ".join(entries) + ".")
    else:
        out.append(f"{f.name} has no crop history recorded.")
    return out


def advisor_context(farm: FarmOut) -> AdvisorContext:
    facts = [f"Farm: {farm.name}" + (f", {farm.region}" if farm.region else "")
             + f". {len(farm.fields)} field{'s' if len(farm.fields) != 1 else ''}"
             + (f", {sum(f.area_ha for f in farm.fields):.1f} ha in total." if farm.fields else ".")]
    p = farm.priorities
    facts.append(f"Farmer's priorities for ranking options (weights): yield {p.yield_:g}, water {p.water:g}, "
                 f"risk {p.risk:g}, soil {p.soil:g}, margin {p.margin:g}.")
    if farm.constraints:
        facts.append(f"Farmer's constraints: {farm.constraints}")
    for f in farm.fields:
        facts += _field(f)

    questions = ["Summarise what this profile says about my fields."]
    if farm.fields:
        questions.append("How do the soils differ between my fields?")
        if any(not f.crop_history for f in farm.fields):
            questions.append("What is missing from the profile?")
    else:
        questions.append("What should I add first?")
    questions.append("Where can I see how my crops are doing?")
    return AdvisorContext(instructions=INSTRUCTIONS, facts=facts, suggested_questions=questions)
