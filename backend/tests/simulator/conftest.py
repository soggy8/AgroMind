import pytest

from app.modules.simulator import ports
from app.modules.simulator.engine import et0 as et0_mod


@pytest.fixture(scope="session")
def climate():
    return ports.load_sample_climate()


@pytest.fixture(scope="session")
def et0(climate):
    return et0_mod.climate_et0(climate)


@pytest.fixture(scope="session")
def soil():
    return ports.load_soil()


@pytest.fixture
def api(client, db_session):
    """API client on a fresh in-memory database holding CropTwin's demo farm."""
    from app.modules.croptwin.seed import seed_demo_farm

    seed_demo_farm(db_session)
    return client
