"""Saved simulation runs, in the shared database (table `simulation_runs`)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import SimulationRun
from .schemas import SavedRun, SavedRunSummary, SimulationRequest, SimulationResult


def _summary(row: SimulationRun) -> SavedRunSummary:
    return SavedRunSummary(id=row.id, name=row.name, created_at=row.created_at, scenario=row.scenario,
                           rotation_names=row.rotation_names, recommended_rotation=row.recommended_rotation)


def save(session: Session, farm_id: str, name: str, request: SimulationRequest, result: SimulationResult) -> SavedRun:
    best = next(r.name for r in result.rotations if r.rotation_id == result.recommendation.rotation_id)
    row = SimulationRun(farm_id=farm_id, field_id=request.field_id, name=name,
                        scenario=request.scenario.model_dump(), rotation_names=[r.name for r in request.rotations],
                        recommended_rotation=best, model_version=result.model_version,
                        request=request.model_dump(mode="json", by_alias=True),
                        result=result.model_dump(mode="json", by_alias=True))
    session.add(row)
    session.commit()
    return SavedRun(**_summary(row).model_dump(), request=request, result=result)


def list_runs(session: Session, farm_id: str) -> list[SavedRunSummary]:
    rows = session.scalars(select(SimulationRun).where(SimulationRun.farm_id == farm_id)
                           .order_by(SimulationRun.created_at.desc()))
    return [_summary(r) for r in rows]


def _row(session: Session, farm_id: str, run_id: str) -> SimulationRun | None:
    row = session.get(SimulationRun, run_id)
    return row if row is not None and row.farm_id == farm_id else None


def get(session: Session, farm_id: str, run_id: str) -> SavedRun | None:
    row = _row(session, farm_id, run_id)
    if row is None:
        return None
    return SavedRun(**_summary(row).model_dump(), request=SimulationRequest.model_validate(row.request),
                    result=SimulationResult.model_validate(row.result))


def delete(session: Session, farm_id: str, run_id: str) -> bool:
    row = _row(session, farm_id, run_id)
    if row is None:
        return False
    session.delete(row)
    session.commit()
    return True
