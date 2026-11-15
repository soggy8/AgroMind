"""Accounts: create users, sign in and out, and say who is signed in. Other modules use only this file."""
from __future__ import annotations

import hashlib
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.shared.db import get_session, utcnow

from .models import AuthSession, User
from .passwords import DUMMY_HASH, hash_password, verify_password
from .schemas import UserOut

COOKIE = "agromind_session"
SESSION_DAYS = 30
MIN_PASSWORD = 8


class EmailTaken(Exception):
    pass


class BadCredentials(Exception):
    pass


class WeakPassword(Exception):
    pass


class InvalidEmail(Exception):
    pass


def normalise_email(email: str) -> str:
    v = email.strip().lower()
    local, _, domain = v.partition("@")
    if not local or "." not in domain or " " in v or domain.startswith(".") or domain.endswith("."):
        raise InvalidEmail("Enter an email address such as name@example.com.")
    return v


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(dt: datetime) -> datetime:
    # SQLite hands datetimes back without a timezone; they were stored as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _new_session(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session.add(AuthSession(id=_digest(token), user_id=user.id, expires_at=utcnow() + timedelta(days=SESSION_DAYS)))
    session.commit()
    return token


def sign_up(session: Session, email: str, password: str) -> tuple[UserOut, str]:
    email = normalise_email(email)
    if len(password) < MIN_PASSWORD:
        raise WeakPassword(f"Use a password of at least {MIN_PASSWORD} characters.")
    if session.scalar(select(User.id).where(User.email == email)):
        raise EmailTaken("An account with this email already exists. Sign in instead.")
    user = User(email=email, password_hash=hash_password(password))
    session.add(user)
    try:
        session.flush()
    except IntegrityError as e:  # two sign-ups at once
        session.rollback()
        raise EmailTaken("An account with this email already exists. Sign in instead.") from e
    return UserOut(id=user.id, email=user.email), _new_session(session, user)


def sign_in(session: Session, email: str, password: str) -> tuple[UserOut, str]:
    email = email.strip().lower()
    user = session.scalar(select(User).where(User.email == email))
    if not verify_password(password, user.password_hash if user else DUMMY_HASH) or user is None:
        raise BadCredentials("That email and password don't match an account.")
    # Drop this user's expired sessions while we're here.
    session.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at < utcnow()))
    return UserOut(id=user.id, email=user.email), _new_session(session, user)


def sign_out(session: Session, token: str | None) -> None:
    if token:
        session.execute(delete(AuthSession).where(AuthSession.id == _digest(token)))
        session.commit()


def user_for_token(session: Session, token: str | None) -> UserOut | None:
    if not token or len(token) > 200:
        return None
    row = session.execute(select(User, AuthSession.expires_at).join(AuthSession, AuthSession.user_id == User.id)
                          .where(AuthSession.id == _digest(token))).first()
    if row is None or _aware(row[1]) < utcnow():
        return None
    return UserOut(id=row[0].id, email=row[0].email)


# ----- FastAPI dependencies for other modules -----

def current_user(request: Request, session: Session = Depends(get_session)) -> UserOut | None:
    return user_for_token(session, request.cookies.get(COOKIE))


def optional_user_id(user: UserOut | None = Depends(current_user)) -> str | None:
    return user.id if user else None


def require_user_id(user: UserOut | None = Depends(current_user)) -> str:
    if user is None:
        raise HTTPException(401, "Sign in or create an account to do this.")
    return user.id


# ----- rate limits for sign-up and sign-in (per client address, in memory, per worker; production only) -----
# Failed attempts (wrong password, taken email) are what guessing looks like; successful sign-ups get their own,
# looser cap so a room of people on one Wi-Fi can all join, while a script can't mint thousands of accounts.

_LIMITS = {"failed": (600, 20), "signup": (3600, 100)}  # kind: (window seconds, most allowed in the window)
_hits: dict[tuple[str, str], list[float]] = {}
_lock = threading.Lock()


def _recent(kind: str, client: str, now: float) -> list[float]:
    window, _ = _LIMITS[kind]
    hits = [t for t in _hits.get((kind, client), []) if now - t < window]
    _hits[(kind, client)] = hits
    return hits


def rate_limited(client: str) -> bool:
    """True when this address has used up its failed attempts or sign-ups for now."""
    now = time.monotonic()
    with _lock:
        return any(len(_recent(kind, client, now)) >= most for kind, (_, most) in _LIMITS.items())


def record(kind: str, client: str) -> None:
    now = time.monotonic()
    with _lock:
        _recent(kind, client, now).append(now)
        if len(_hits) > 10_000:  # forget idle addresses
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                del _hits[k]


def reset_rate_limit() -> None:
    with _lock:
        _hits.clear()
