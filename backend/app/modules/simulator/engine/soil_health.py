"""Rotation soil index (0-100): a transparent score of the rotation itself.

It rewards practices associated with better soil in long-term rotation studies (more crops, a
legume, residue return) and penalises a crop following itself. It is not a prediction of soil
carbon or any measured property.
"""
from __future__ import annotations

from ..parameters import COVER_CROP_SOIL_POINTS, CROPS

DIVERSITY_POINTS = {1: 0, 2: 15, 3: 25}   # distinct crops; 4+ gets 30
FAMILY_BONUS = 5
LEGUME_POINTS = 25
RESIDUE_POINTS = 25
RESIDUE_WEIGHT = {"high": 1.0, "medium": 0.5, "low": 0.0}
REPEAT_PENALTY = 15


def rotation_soil_index(crops: list[str], cover_crop: bool = False) -> tuple[int, dict[str, int], list[str]]:
    cycle = [CROPS[c] for c in crops]
    distinct = {c.id for c in cycle}
    families = {c.family for c in cycle}

    diversity = DIVERSITY_POINTS.get(len(distinct), 30) + (FAMILY_BONUS if len(families) > 1 else 0)
    legume = LEGUME_POINTS if "legume" in families else 0
    residue = round(RESIDUE_POINTS * sum(RESIDUE_WEIGHT[c.residue] for c in cycle) / len(cycle))
    repeats = sum(1 for a, b in zip(cycle, cycle[1:] + cycle[:1]) if a.id == b.id)
    penalty = -round(REPEAT_PENALTY * repeats / len(cycle))
    cover = COVER_CROP_SOIL_POINTS if cover_crop else 0
    score = max(0, min(100, diversity + legume + residue + penalty + cover))

    notes = [
        f"{len(distinct)} different crop{'s' if len(distinct) > 1 else ''} from {len(families)} "
        f"famil{'ies' if len(families) > 1 else 'y'}" + (": more diversity breaks pest and disease cycles" if len(distinct) > 1 else ""),
        "Includes a legume, which fixes its own nitrogen" if legume else "No legume in the rotation",
        f"Crop residue returned: {residue} of {RESIDUE_POINTS} points",
    ]
    if penalty:
        notes.append("A crop follows itself, which raises pest pressure and lowers yield")
    if cover:
        notes.append("Cereal rye cover crop over winter: protects soil and holds nitrogen")
    return score, {"diversity": diversity, "legume": legume, "residue": residue, "continuous_penalty": penalty,
                   "cover_crop": cover}, notes
