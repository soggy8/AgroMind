"""Give a seeded farm to the signed-in test user (tests/conftest.py `client`), so tests can edit it.

The seeded demo farm is public and read-only through the API (app/access.py); tests of the editing rules work on
it as if the test farmer owned it.
"""
from sqlalchemy import select, update

from app.modules.accounts.models import User
from app.modules.croptwin.models import Farm


def claim(session, farm_id: str = "demo") -> None:
    user_id = session.scalar(select(User.id).where(User.email == "farmer@example.com"))
    assert user_id, "use the signed-in `client` fixture before claiming a farm"
    session.execute(update(Farm).where(Farm.id == farm_id).values(owner_id=user_id))
    session.commit()
