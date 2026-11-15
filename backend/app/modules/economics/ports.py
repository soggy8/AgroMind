"""The only door to the Simulator. Turns its public results into plain dataclasses.

Imports `app.modules.simulator.service` and nothing else from the Simulator. Tests can pass a fake
object with the same four functions to `service.build_report(..., port=...)`.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from app.modules.simulator import service as simulator

from .schemas import EconScenario, RotationInput


class NotFound(Exception):
    """Unknown farm or field."""


class InvalidRequest(Exception):
    """A request the module can't price or the Simulator rejects; the message is shown to the user."""


class WeatherUnavailable(Exception):
    """The Simulator couldn't load weather for the field."""


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
    temp_change_c: float   # May-Sep median across models
    rain_change_pct: float  # May-Sep median across models


@dataclass(frozen=True)
class RotationRun:
    rotation_id: str
    season_crops: tuple[str, ...]
    track_yields: np.ndarray  # (seasons, tracks), share of typical yield
    irrigation_mm_p50: tuple[float, ...]
    simulator_margin: tuple[float, float, float] | None  # Simulator's margin_per_ha p10/p50/p90


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
            return FieldInfo(field_id=f.id, name=f.name, area_ha=float(f.area_ha), current_crop_id=f.crop_id)
    raise NotFound(f"No field '{field_id}' on farm '{farm_id}'.")


def suggested_rotations(session: Session, farm_id: str) -> list[RotationInput]:
    return [RotationInput(id=r.id, name=r.name, crops=list(r.crops), cover_crop=r.cover_crop)
            for r in _options(session, farm_id).suggested_rotations]


def projection(session: Session, farm_id: str, projection_id: str) -> ProjectionDelta:
    for p in _options(session, farm_id).projections:
        if p.id == projection_id:
            return ProjectionDelta(id=p.id, label=f"NASA {p.period}, {p.ssp_name}",
                                   temp_change_c=float(p.temp_change_c["median"]),
                                   rain_change_pct=float(p.rain_change_pct["median"]))
    raise InvalidRequest(f"No saved climate projection '{projection_id}' for this farm.")


def run(session: Session, farm_id: str, field_id: str, rotations: list[RotationInput], scenario: EconScenario,
        include_economics: bool = False) -> Run:
    req = simulator.SimulationRequest(
        field_id=field_id,
        rotations=[simulator.RotationInput(id=r.id, name=r.name, crops=list(r.crops), cover_crop=r.cover_crop)
                   for r in rotations],
        scenario=simulator.Scenario(**scenario.model_dump(), price_change_pct=0),
        include_economics=include_economics,
    )
    try:
        res = simulator.run_simulation(session, farm_id, req)
    except simulator.NotFound as e:
        raise NotFound(str(e)) from e
    except simulator.InvalidRotation as e:
        raise InvalidRequest(str(e)) from e
    except simulator.WeatherUnavailable as e:
        raise WeatherUnavailable(str(e)) from e

    out: dict[str, RotationRun] = {}
    for r in res.rotations:
        m = r.economics.margin_per_ha if r.economics is not None else None
        out[r.rotation_id] = RotationRun(
            rotation_id=r.rotation_id,
            season_crops=tuple(s.crop_id for s in r.seasons),
            track_yields=np.asarray(r.track_seasons, dtype=float).T.reshape(len(r.seasons), -1),
            irrigation_mm_p50=tuple(float(s.irrigation_mm.p50) for s in r.seasons),
            simulator_margin=(m.p10, m.p50, m.p90) if m is not None else None,
        )
    return Run(rotations=out, calibrated=res.calibrated, ensemble_start_years=list(res.ensemble_start_years),
               data_note=res.data_note, model_version=res.model_version)
