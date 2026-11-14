"""Rotations: validation, the planting schedule, and suggested rotations for the demo region."""
from __future__ import annotations

from datetime import date, timedelta

from .engine.types import Planting
from .parameters import CROPS, DAYS_PER_YEAR, MIN_TURNAROUND_DAYS, PLANT_WINDOW_DAYS
from .schemas import RotationInput


class InvalidRotation(ValueError):
    pass


def validate(crops: list[str]) -> None:
    unknown = [c for c in crops if c not in CROPS]
    if unknown:
        raise InvalidRotation(f"Unknown crop id(s): {', '.join(sorted(set(unknown)))}. "
                              f"Known: {', '.join(CROPS)}.")


def schedule(crops: list[str], years: int, previous_crop_id: str | None) -> list[Planting]:
    """Place the rotation's crops on a timeline of `years` calendar years, repeating the cycle.

    Each crop is planted on its usual day, or up to PLANT_WINDOW_DAYS late if the previous crop is
    still being harvested; otherwise it waits for the next year. Seasons that would end after the
    horizon are dropped.
    """
    validate(crops)
    horizon = years * DAYS_PER_YEAR
    plantings: list[Planting] = []
    earliest = 0
    predecessor = previous_crop_id
    i = 0
    while True:
        crop = CROPS[crops[i % len(crops)]]
        year = earliest // DAYS_PER_YEAR
        plant = year * DAYS_PER_YEAR + crop.plant_doy - 1
        if plant < earliest:
            plant = earliest if earliest - plant <= PLANT_WINDOW_DAYS else plant + DAYS_PER_YEAR
        harvest = plant + crop.season_days
        if harvest > horizon:
            break
        plantings.append(Planting(len(plantings), crop.id, plant, harvest, predecessor))
        predecessor = crop.id
        earliest = harvest + MIN_TURNAROUND_DAYS
        i += 1
    return plantings


def day_label(day: int) -> str:
    """'May 5' for a day offset within a 365-day year."""
    d = date(2001, 1, 1) + timedelta(days=day % DAYS_PER_YEAR)
    return f"{d:%b} {d.day}"  # not "%-d": that format code is unsupported on Windows


def season_label(crop_id: str) -> str:
    c = CROPS[crop_id]
    start = c.plant_doy - 1
    return f"{day_label(start)} - {day_label(start + c.season_days)}"


def rotation_name(crops: list[str]) -> str:
    if len(set(crops)) == 1:
        return f"Continuous {CROPS[crops[0]].name.lower()}"
    return " → ".join(CROPS[c].name for c in crops)


SUGGESTED: list[RotationInput] = [
    RotationInput(id="A", name="Continuous maize", crops=["maize"]),
    RotationInput(id="B", name="Maize → Soybean", crops=["maize", "soybean"]),
    RotationInput(id="C", name="Maize → Soybean → Oats", crops=["maize", "soybean", "oats"]),
]
