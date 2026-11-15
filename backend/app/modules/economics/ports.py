"""The economics module's only door to the Simulator: its public service, as plain dataclasses.

Nothing else in this module imports the Simulator, so the service can be tested with a fake port.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from app.modules.simulator import service as simulator

from .schemas import EconScenario, RotationInput


class NotFound(Exception):
    pass


class InvalidRequest(Exception):
    pass


class WeatherUnavailable(Exception):
    pass


@dataclass(frozen=True)
class FieldInfo:
    field_id: str
    name: str
    area_ha: float
    current_crop_id: str | None


@dataclass(frozen=True)
class ProjectionDelta:
    id: str
    label: str
    temp_change_c: float      # May-Sep median
    rain_change_pct: float    # May-Sep median


@dataclass(frozen=True)
class RotationRun:
    rotation_id: str
    season_crops: tuple[str, ...]
    track_yields: np.ndarray  # (seasons, tracks), relative yield
    irrigation_mm_p50: tuple[float, ...]
    simulator_margin: tuple[float, float, float] | None  # margin_per_ha p10/p50/p90, only with include_economics


@dataclass(frozen=True)
class Run:
    rotations: dict[str, RotationRun]
    calibrated: bool
    ensemble_start_years: list[int]
    data_note: str
    model_version: str


def _options(session: Session, farm_id: str):
    try:
        return simulator.get_options(session, farm_id)
    except simulator.NotFound as e:
        raise NotFound(str(e)) from e


def field_info(session: Session, farm_id: str, field_id: str) -> FieldInfo:
    for f in _options(session, farm_id).fields:
        if f.id == field_id:
            return FieldInfo(field_id=f.id, name=f.name, area_ha=f.area_ha, current_crop_id=f.crop_id)
    raise NotFound(f"No field '{field_id}' on farm '{farm_id}'.")


def suggested_rotations(session: Session, farm_id: str) -> list[RotationInput]:
    return [RotationInput(id=r.id, name=r.name, crops=list(r.crops), cover_crop=r.cover_crop)
            for r in _options(session, farm_id).suggested_rotations]


def known_crops(session: Session, farm_id: str) -> frozenset[str]:
    """Ids of every crop in the Simulator's catalogue, with or without price and cost data."""
    return frozenset(c.id for c in _options(session, farm_id).crops)


def projection(session: Session, farm_id: str, projection_id: str) -> ProjectionDelta:
    for p in _options(session, farm_id).projections:
        if p.id == projection_id:
            return ProjectionDelta(id=p.id, label=f"NASA {p.period}, {p.ssp_name}",
                                   temp_change_c=p.temp_change_c["median"],
                                   rain_change_pct=p.rain_change_pct["median"])
    raise InvalidRequest(f"No saved climate projection '{projection_id}' for this location.")


def run(session: Session, farm_id: str, field_id: str, rotations: list[RotationInput],
        scenario: EconScenario, include_economics: bool = False) -> Run:
    request = simulator.SimulationRequest(
        field_id=field_id,
        rotations=[simulator.RotationInput(**r.model_dump()) for r in rotations],
        scenario=simulator.Scenario(**scenario.model_dump(), price_change_pct=0),
        include_economics=include_economics,
    )
    try:
        result = simulator.run_simulation(session, farm_id, request)
    except simulator.NotFound as e:
        raise NotFound(str(e)) from e
    except simulator.InvalidRotation as e:
        raise InvalidRequest(str(e)) from e
    except simulator.WeatherUnavailable as e:
        raise WeatherUnavailable(str(e)) from e

    runs: dict[str, RotationRun] = {}
    for r in result.rotations:
        margin = None
        if r.economics is not None:
            m = r.economics.margin_per_ha
            margin = (m.p10, m.p50, m.p90)
        runs[r.rotation_id] = RotationRun(
            rotation_id=r.rotation_id,
            season_crops=tuple(s.crop_id for s in r.seasons),
            track_yields=np.asarray(r.track_seasons, dtype=float).T,
            irrigation_mm_p50=tuple(s.irrigation_mm.p50 for s in r.seasons),
            simulator_margin=margin,
        )
    return Run(rotations=runs, calibrated=result.calibrated,
               ensemble_start_years=list(result.ensemble_start_years),
               data_note=result.data_note, model_version=result.model_version)
