"""HTTP only: parse, call the service, map errors."""
from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.shared.db import get_session

from . import service
from .schemas import (AdvisorContext, FinderRequest, FinderResult, IrrigationPlan, IrrigationPlanRequest, SavedRun,
                      SavedRunSummary, SaveRunRequest, SimulationRequest, SimulationResult, SimulatorOptions)

router = APIRouter(prefix="/api/farms/{farm_id}/simulations", tags=["simulator"])
T = TypeVar("T")
DB = Depends(get_session)


def _call(fn: Callable[..., T], *args) -> T:
    try:
        return fn(*args)
    except service.NotFound as e:
        raise HTTPException(404, str(e)) from e
    except service.InvalidRotation as e:
        raise HTTPException(422, str(e)) from e
    except service.WeatherUnavailable as e:
        raise HTTPException(503, f"{e} Try again, or use the demo farm, which works offline.") from e


@router.get("/options", response_model=SimulatorOptions)
def get_options(farm_id: str, session: Session = DB):
    return _call(service.get_options, session, farm_id)


@router.post("/run", response_model=SimulationResult)
def run(farm_id: str, body: SimulationRequest, session: Session = DB):
    return _call(service.run_simulation, session, farm_id, body)


@router.post("/find", response_model=FinderResult)
def find(farm_id: str, body: FinderRequest, session: Session = DB):
    """Try every crop cycle up to `max_length` and return the best for the farmer's priorities."""
    return _call(service.find_rotations, session, farm_id, body)


@router.post("/irrigation-plan", response_model=IrrigationPlan)
def irrigation_plan(farm_id: str, body: IrrigationPlanRequest, session: Session = DB):
    """Yield against seasonal irrigation cap for one rotation, and the smallest cap that reaches the target."""
    return _call(service.plan_irrigation, session, farm_id, body)


@router.post("/advisor-context", response_model=AdvisorContext)
def advisor_context(farm_id: str, body: SimulationResult):
    return service.advisor_context(body)


@router.post("", response_model=SavedRun, status_code=201)
def save(farm_id: str, body: SaveRunRequest, session: Session = DB):
    return _call(service.save_run, session, farm_id, body.name, body.request)


@router.get("", response_model=list[SavedRunSummary])
def list_runs(farm_id: str, session: Session = DB):
    return _call(service.list_runs, session, farm_id)


@router.get("/{run_id}", response_model=SavedRun)
def get_run(farm_id: str, run_id: str, session: Session = DB):
    return _call(service.get_run, session, farm_id, run_id)


@router.delete("/{run_id}", status_code=204)
def delete_run(farm_id: str, run_id: str, session: Session = DB):
    _call(service.delete_run, session, farm_id, run_id)
    return Response(status_code=204)
