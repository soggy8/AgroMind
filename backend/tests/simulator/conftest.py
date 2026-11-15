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
    """Signed-in API client on a fresh in-memory database holding CropTwin's demo farm, owned by the test farmer."""
    from app.modules.croptwin.seed import seed_demo_farm
    from tests.ownership import claim

    seed_demo_farm(db_session)
    claim(db_session)  # the signed-in test farmer owns it, so runs can be saved
    return client
