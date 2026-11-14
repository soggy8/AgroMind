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


@pytest.fixture(autouse=True)
def _isolated_store(tmp_path, monkeypatch):
    from app.modules.simulator import store
    monkeypatch.setattr(store, "ROOT", tmp_path / "runs")
