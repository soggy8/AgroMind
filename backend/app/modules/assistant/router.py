"""HTTP only: stream one assistant turn as NDJSON."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.shared import i18n
from app.shared.db import get_session

from . import agent
from .schemas import ChatRequest

router = APIRouter(prefix="/api/farms/{farm_id}/assistant", tags=["assistant"])


@router.post("/chat")
def chat(farm_id: str, body: ChatRequest, request: Request, session: Session = Depends(get_session)):
    """Streams events, one JSON object per line (see agent.py), in the language of Accept-Language."""
    lang = i18n.language(request.headers.get("accept-language"))
    lines = (json.dumps(e, ensure_ascii=False, default=str) + "\n" for e in agent.run(session, farm_id, body, lang=lang))
    return StreamingResponse(lines, media_type="application/x-ndjson", headers={"Cache-Control": "no-store"})
