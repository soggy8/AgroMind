import pytest


@pytest.fixture
def api(client, db_session):
    """API client on a fresh in-memory database holding CropTwin's demo farm."""
    from app.modules.croptwin.seed import seed_demo_farm

    seed_demo_farm(db_session)
    return client


@pytest.fixture
def db(db_session):
    from app.modules.croptwin.seed import seed_demo_farm

    seed_demo_farm(db_session)
    return db_session
