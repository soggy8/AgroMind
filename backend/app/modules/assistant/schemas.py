"""The assistant's API contract. Mirrored by frontend/src/shared/assistant/types.ts: change both together.

POST /api/farms/{farm_id}/assistant/chat takes a ChatRequest and streams events, one JSON object per line
(application/x-ndjson). Event shapes are documented in `agent.py`; actions in `tools.py`.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

Page = Literal["home", "overview", "command-center", "simulator", "economics", "farm-profile"]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=12000)


class PageState(BaseModel):
    """What the farmer is looking at, so 'this field' and 'make it hotter' mean something."""
    page: Page = "home"
    field_id: str | None = None            # the field selected on the current page
    as_of: date | None = None              # Command Center date (None: its default)
    layer: str | None = None               # Command Center map layer
    simulation: dict[str, Any] | None = None   # the Simulator's current SimulationRequest (JSON)
    has_result: bool = False               # the Simulator shows results for `simulation`


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=40)
    facts: list[str] = Field(default_factory=list, max_length=300)  # facts from earlier turns, numbered from 1
    page: PageState = PageState()
