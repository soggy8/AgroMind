"""HTTP only: parse, call the service, map errors."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.shared.db import get_session

from . import service
from .schemas import FarmHealth

router = APIRouter(prefix="/api/farms/{farm_id}/health", tags=["cropdoctor"])


@router.get("", response_model=FarmHealth)
def get_health(farm_id: str, as_of: date | None = Query(None), session: Session = Depends(get_session)):
    try:
        return service.get_health(session, farm_id, as_of)
    except service.NotFound as e:
        raise HTTPException(404, str(e)) from e
    except service.InvalidDate as e:
        raise HTTPException(422, str(e)) from e
    except service.DataUnavailable as e:
        raise HTTPException(503, str(e)) from e
