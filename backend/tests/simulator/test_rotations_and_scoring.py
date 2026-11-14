import pytest

from app.modules.simulator import ranking, rotations, scenarios
from app.modules.simulator.engine import soil_health
from app.modules.simulator.schemas import Priorities, Scenario


def test_maize_soybean_one_season_per_year():
    p = rotations.schedule(["maize", "soybean"], 4, previous_crop_id="soybean")
    assert [x.crop_id for x in p] == ["maize", "soybean", "maize", "soybean"]
    assert [x.plant_day // 365 for x in p] == [0, 1, 2, 3]
    assert p[0].predecessor_crop_id == "soybean" and p[1].predecessor_crop_id == "maize"


def test_winter_wheat_after_soybean_spans_two_years():
    p = rotations.schedule(["soybean", "winter_wheat", "maize"], 5, previous_crop_id=None)
    wheat = next(x for x in p if x.crop_id == "winter_wheat")
    soy = p[0]
    assert wheat.plant_day >= soy.harvest_day + 7
    assert wheat.harvest_day // 365 == wheat.plant_day // 365 + 1
    maize = next(x for x in p if x.crop_id == "maize")
    assert maize.plant_day > wheat.harvest_day


def test_one_crop_rotation_fills_every_year():
    assert len(rotations.schedule(["maize"], 10, None)) == 10


def test_season_that_does_not_fit_is_dropped():
    assert rotations.schedule(["winter_wheat"], 1, None) == []


def test_unknown_crop_rejected():
    with pytest.raises(rotations.InvalidRotation):
        rotations.schedule(["chickpea"], 3, None)


def test_scenario_apply(climate):
    s = scenarios.apply(climate, Scenario(temp_delta_c=2, rain_change_pct=-20))
    assert (s.tmax_c - climate.tmax_c).mean() == pytest.approx(2)
    assert s.rain_mm.sum() == pytest.approx(climate.rain_mm.sum() * 0.8)
    assert scenarios.apply(climate, Scenario()) is climate


def test_soil_index_orders_rotations_sensibly():
    cont, _, _ = soil_health.rotation_soil_index(["maize"])
    ms, _, _ = soil_health.rotation_soil_index(["maize", "soybean"])
    mso, comps, _ = soil_health.rotation_soil_index(["maize", "soybean", "oats"])
    assert cont < ms < mso
    assert comps["legume"] == 25


def test_scenario_validation():
    with pytest.raises(ValueError):
        Scenario(irrigation="limited")
    with pytest.raises(ValueError):
        Scenario(temp_delta_c=9)


def test_weights_normalise_and_drop_margin_without_economics():
    w = ranking.weights(Priorities(**{"yield": 2, "water": 1, "risk": 1, "soil": 0, "margin": 4}), include_margin=False)
    assert w["margin"] == 0 and sum(w.values()) == pytest.approx(1)
    assert w["yield"] == pytest.approx(0.5)
