"""Who may open which farm. Applied by main.py to every router under /api/farms.

- A farm without an owner (the demo farm) is public: anyone may read it and run what-ifs on it (simulations, the
  rotation finder, the irrigation plan, the money report, the advisor and the assistant), and nobody may change it.
- A farm with an owner is visible only to that owner. To anyone else it doesn't exist (404), so ids don't leak.

This file sits at app level, like models.py, so it may use two modules' service.py without them knowing each other.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.modules.accounts import service as accounts
from app.modules.croptwin import service as croptwin
from app.shared.db import get_session

READ_ONLY = "The demo farm is read-only. Create an account to make your own farm, draw fields and save runs."
# POSTs that compute an answer from the farm without changing anything (allowed on public farms).
_COMPUTE = ("/run", "/find", "/irrigation-plan", "/advisor-context", "/report", "/chat")


def is_write(method: str, path: str) -> bool:
    if method in ("GET", "HEAD", "OPTIONS"):
        return False
    return not (method == "POST" and path.rstrip("/").endswith(_COMPUTE))


def farm_access(request: Request, session: Session = Depends(get_session),
                user_id: str | None = Depends(accounts.optional_user_id)) -> None:
    farm_id = request.path_params.get("farm_id")
    if farm_id is None:
        return  # /api/farms itself: the routes check sign-in (create) or filter the list
    exists, owner = croptwin.farm_owner(session, farm_id)
    if not exists:
        return  # the route answers 404 in its own words
    if owner is None:
        if is_write(request.method, request.url.path):
            raise HTTPException(403, READ_ONLY)
        return
    if owner != user_id:
        raise HTTPException(404, f"Unknown farm '{farm_id}'")
