import pytest

from app.modules.economics import ports
from app.modules.economics.schemas import EconScenario, RotationInput


def test_field_info_and_suggestions(db):
    f = ports.field_info(db, "demo", "north")
    assert f.field_id == "north" and f.area_ha > 0
    assert [r.id for r in ports.suggested_rotations(db, "demo")] == ["A", "B", "C"]


def test_run_shapes(db):
    rots = [RotationInput(id="B", name="Maize → Soybean", crops=["maize", "soybean"])]
    run = ports.run(db, "demo", "north", rots, EconScenario(years=5), include_economics=True)
    b = run.rotations["B"]
    assert b.track_yields.shape == (len(b.season_crops), 25) and len(run.ensemble_start_years) == 25
    assert b.simulator_margin is not None and len(b.irrigation_mm_p50) == len(b.season_crops)


def test_errors_are_mapped(db):
    with pytest.raises(ports.NotFound):
        ports.field_info(db, "demo", "nope")
    with pytest.raises(ports.InvalidRequest):
        ports.projection(db, "demo", "ssp999_2990s")
