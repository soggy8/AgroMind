"""HTTP only: parse, call the service, set or clear the session cookie."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.shared.db import get_session

from . import service
from .schemas import Credentials, UserOut

router = APIRouter(prefix="/api/auth", tags=["accounts"])
DB = Depends(get_session)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(service.COOKIE, token, max_age=service.SESSION_DAYS * 86400, httponly=True, samesite="lax",
                        secure=get_settings().environment == "production", path="/")


def _client(request: Request) -> str | None:
    """The address to rate-limit, or None outside production (tests and the e2e suite sign up a lot)."""
    if get_settings().environment != "production":
        return None
    return request.client.host if request.client else "?"


def _limit(client: str | None) -> None:
    if client and service.rate_limited(client):
        raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")


def _failed(client: str | None, status: int, e: Exception) -> HTTPException:
    if client:
        service.record("failed", client)
    return HTTPException(status, str(e))


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(body: Credentials, request: Request, response: Response, session: Session = DB):
    client = _client(request)
    _limit(client)
    try:
        user, token = service.sign_up(session, body.email, body.password)
    except (service.WeakPassword, service.InvalidEmail) as e:
        raise HTTPException(422, str(e)) from e  # a typo, not a guess: not counted
    except service.EmailTaken as e:
        raise _failed(client, 409, e) from e
    if client:
        service.record("signup", client)
    _set_cookie(response, token)
    return user


@router.post("/login", response_model=UserOut)
def login(body: Credentials, request: Request, response: Response, session: Session = DB):
    client = _client(request)
    _limit(client)
    try:
        user, token = service.sign_in(session, body.email, body.password)
    except service.BadCredentials as e:
        raise _failed(client, 401, e) from e
    _set_cookie(response, token)
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, session: Session = DB):
    service.sign_out(session, request.cookies.get(service.COOKIE))
    response = Response(status_code=204)
    response.delete_cookie(service.COOKIE, path="/")
    return response


@router.get("/me", response_model=UserOut | None)
def me(user: UserOut | None = Depends(service.current_user)):
    """The signed-in user, or null when nobody is signed in."""
    return user
