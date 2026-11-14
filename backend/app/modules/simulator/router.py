"""HTTP only: parse, call the service, map errors."""
from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, HTTPException, Response

from . import service
from .schemas import (AdvisorContext, SavedRun, SavedRunSummary, SaveRunRequest, SimulationRequest,
                      SimulationResult, SimulatorOptions)

router = APIRouter(prefix="/api/farms/{farm_id}/simulations", tags=["simulator"])
T = TypeVar("T")


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
def get_options(farm_id: str):
    return _call(service.get_options, farm_id)


@router.post("/run", response_model=SimulationResult)
def run(farm_id: str, body: SimulationRequest):
    return _call(service.run_simulation, farm_id, body)


@router.post("/advisor-context", response_model=AdvisorContext)
def advisor_context(farm_id: str, body: SimulationResult):
    return service.advisor_context(body)


@router.post("", response_model=SavedRun, status_code=201)
def save(farm_id: str, body: SaveRunRequest):
    return _call(service.save_run, farm_id, body.name, body.request)


@router.get("", response_model=list[SavedRunSummary])
def list_runs(farm_id: str):
    return _call(service.list_runs, farm_id)


@router.get("/{run_id}", response_model=SavedRun)
def get_run(farm_id: str, run_id: str):
    return _call(service.get_run, farm_id, run_id)


@router.delete("/{run_id}", status_code=204)
def delete_run(farm_id: str, run_id: str):
    _call(service.delete_run, farm_id, run_id)
    return Response(status_code=204)
