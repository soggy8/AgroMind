"""HTTP for the shared AI advisor: POST /api/advisor/ask."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import client

router = APIRouter(prefix="/api/advisor", tags=["advisor"])


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class AskRequest(BaseModel):
    facts: list[str] = Field(min_length=1, max_length=200)
    instructions: str = Field("", max_length=4000)
    question: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=40)


class AskResponse(BaseModel):
    answer: str
    cited_facts: list[int]          # fact numbers (1-based) the answer cites
    grounded: bool                  # cites at least one fact and no fact that doesn't exist
    model: str
    refused: bool


@router.post("/ask", response_model=AskResponse)
def ask(body: AskRequest):
    try:
        a = client.ask(body.facts, body.instructions, body.question, [t.model_dump() for t in body.history])
    except client.AdvisorUnavailable as e:
        raise HTTPException(503, str(e)) from e
    return AskResponse(answer=a.text, cited_facts=a.cited_facts,
                       grounded=bool(a.cited_facts) and not a.unknown_citations, model=a.model, refused=a.refused)
