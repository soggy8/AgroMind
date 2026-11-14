"""Saved simulation runs.

A JSON file per run under backend/var/simulator_runs/<farm_id>/. Swap for a table in
shared/db when the team's PostgreSQL setup exists; the four functions are the interface.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .schemas import SavedRun, SavedRunSummary, SimulationRequest, SimulationResult

ROOT = Path(os.environ.get("AGROMIND_SIM_STORE", Path(__file__).resolve().parents[3] / "var" / "simulator_runs"))


def _dir(farm_id: str) -> Path:
    if not farm_id.replace("-", "").replace("_", "").isalnum():
        raise ValueError("invalid farm id")
    return ROOT / farm_id


def save(farm_id: str, name: str, request: SimulationRequest, result: SimulationResult) -> SavedRun:
    run = SavedRun(
        id=uuid.uuid4().hex[:12], name=name, created_at=datetime.now(timezone.utc), scenario=request.scenario,
        rotation_names=[r.name for r in request.rotations],
        recommended_rotation=next(r.name for r in result.rotations if r.rotation_id == result.recommendation.rotation_id),
        request=request, result=result,
    )
    d = _dir(farm_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{run.id}.json").write_text(run.model_dump_json(by_alias=True))
    return run


def list_runs(farm_id: str) -> list[SavedRunSummary]:
    d = _dir(farm_id)
    if not d.exists():
        return []
    runs = []
    for p in d.glob("*.json"):
        data = json.loads(p.read_text())
        runs.append(SavedRunSummary.model_validate({k: data[k] for k in SavedRunSummary.model_fields}))
    return sorted(runs, key=lambda r: r.created_at, reverse=True)


def get(farm_id: str, run_id: str) -> SavedRun | None:
    p = _dir(farm_id) / f"{run_id}.json"
    if not run_id.isalnum() or not p.exists():
        return None
    return SavedRun.model_validate_json(p.read_text())


def delete(farm_id: str, run_id: str) -> bool:
    p = _dir(farm_id) / f"{run_id}.json"
    if not run_id.isalnum() or not p.exists():
        return False
    p.unlink()
    return True
