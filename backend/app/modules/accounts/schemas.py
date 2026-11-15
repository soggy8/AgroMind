"""Accounts API contract. Mirrored by frontend/src/app/auth/types.ts."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: str
    email: str
