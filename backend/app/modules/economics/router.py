"""HTTP only: parse, call the service, map errors."""
from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.shared.db import get_session

from . import service
from .schemas import EconomicsDefaults, EconomicsReport, EconomicsRequest

router = APIRouter(prefix="/api/farms/{farm_id}/economics", tags=["economics"])
T = TypeVar("T")
DB = Depends(get_session)


def _call(fn: Callable[..., T], *args) -> T:
    try:
        return fn(*args)
    except service.NotFound as e:
        raise HTTPException(404, str(e)) from e
    except service.InvalidRequest as e:
        raise HTTPException(422, str(e)) from e
    except service.WeatherUnavailable as e:
        raise HTTPException(503, f"{e} Try again, or use the demo farm, which works offline.") from e


@router.get("/defaults", response_model=EconomicsDefaults)
def get_defaults(farm_id: str, session: Session = DB):
    return _call(service.get_defaults, session, farm_id)


@router.post("/report", response_model=EconomicsReport)
def report(farm_id: str, body: EconomicsRequest, session: Session = DB):
    return _call(service.build_report, session, farm_id, body)
