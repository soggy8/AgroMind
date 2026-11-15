"""Shared test fixtures: an in-memory SQLite database per test, wired into the API."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import metadata
from app.shared.db import get_session


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db_session):
    from app.main import app

    app.dependency_overrides[get_session] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _no_real_llm(monkeypatch):
    """Tests never call a real LLM: .env may hold a real key, and the free tier's quota is small."""
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "llm_api_key", "")
