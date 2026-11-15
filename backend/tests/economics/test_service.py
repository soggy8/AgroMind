"""Service tests on a fake Simulator port: yields depend on warming in a known way."""
import numpy as np
import pytest

from app.modules.economics import money, ports, service
from app.modules.economics import parameters as p
from app.modules.economics import sentences as s
from app.modules.economics.schemas import EconomicsRequest, EconScenario, RotationInput

AREA = 80.0
MS = {"id": "MS", "name": "Maize → Soybean", "crops": ["maize", "soybean"]}
MSO = {"id": "MSO", "name": "Maize → Soybean → Oats", "crops": ["maize", "soybean", "oats"], "cover_crop": True}
WS = {"id": "WS", "name": "Wheat → Soybean", "crops": ["winter_wheat", "soybean"]}
BASE = np.array([1.0, 0.7])  # two weather tracks


def loss_per_c(rot: RotationInput) -> float:
    return 0.10 if rot.crops == ["maize", "soybean"] else 0.03


class FakePort:
    NotFound, InvalidRequest, WeatherUnavailable = ports.NotFound, ports.InvalidRequest, ports.WeatherUnavailable

    def __init__(self, calibrated: bool = True):
        self.calibrated = calibrated
        self.seen: list[EconScenario] = []
        self.seen_rotations: set[str] = set()

    def field_info(self, session, farm_id, field_id):
        return ports.FieldInfo(field_id, "North field", AREA, "soybean")

    def suggested_rotations(self, session, farm_id):
        return [RotationInput(id="A", name="Continuous maize", crops=["maize"]),
                RotationInput(id="B", name="Maize → Soybean", crops=["maize", "soybean"]),
                RotationInput(id="C", name="Maize → Soybean → Oats", crops=["maize", "soybean", "oats"])]

    def projection(self, session, farm_id, projection_id):
        return ports.ProjectionDelta(projection_id, "NASA 2050s, Middle of the road", 2.4, -6.0)

    def run(self, session, farm_id, field_id, rotations, sc):
        self.seen.append(sc)
        self.seen_rotations |= {r.id for r in rotations}
        warm = 2.4 if sc.projection else sc.temp_delta_c
        out = {}
        for r in rotations:
            loss = loss_per_c(r) * warm * (0.5 if sc.heat_response == "local" else 1.0)
            crops = tuple(r.crops[i % len(r.crops)] for i in range(sc.years))
            y = np.tile(BASE * (1 - loss), (len(crops), 1))
            out[r.id] = ports.RotationRun(r.id, crops, y, tuple(0.0 for _ in crops), None)
        return ports.Run(out, self.calibrated, [2001, 2002], "", "test-1")


def report(port=None, **kw):
    port = port or FakePort()
    body = {"field_id": "north", "rotations": [MS, MSO], "scenario": {"temp_delta_c": 2, "years": 2}} | kw
    return service.build_report(None, "demo", EconomicsRequest(**body), port=port), port


def expected_annual(rot: dict, warm: float, heat: str = "published") -> np.ndarray:
    r = RotationInput(**rot)
    m, _ = service.resolve_inputs(EconomicsRequest(field_id="x").your_numbers)
    loss = loss_per_c(r) * warm * (0.5 if heat == "local" else 1.0)
    crops = [r.crops[i % len(r.crops)] for i in range(2)]
    sm = money.season_margins(crops, "soybean", np.tile(BASE * (1 - loss), (2, 1)), [0, 0], r.cover_crop, m)
    return money.annual_margins(sm, 2)


def test_climate_bill_and_win_back():
    rep, port = report()
    bill = rep.climate_bill
    change = money.p3(expected_annual(MS, 2) - expected_annual(MS, 0)).p50
    assert bill.change.p50 == round(change) and bill.change.p50 < 0
    wins = money.p3(expected_annual(MSO, 2) - expected_annual(MS, 2)).p50
    assert bill.best_alternative.rotation_id == "MSO"
    if wins > 0:
        assert bill.best_alternative.wins_back_share == round(wins / -change, 3)
    assert bill.other_heat_response == "local"
    assert sum(1 for sc in port.seen if sc.heat_response == "local") == 1
    assert bill.kind == "modelled" and rep.area.kind == "observed"


def test_wins_back_sentence():
    # Make the alternative clearly better: soybean price up only helps both, so use a big warming instead.
    rep, _ = report(scenario={"temp_delta_c": 4, "years": 2})
    assert "wins back" in rep.climate_bill.sentence or "more than makes up" in rep.climate_bill.sentence


def test_whole_field_uses_area():
    rep, _ = report()
    exact = money.p3((expected_annual(MS, 2) - expected_annual(MS, 0)) * AREA).p50
    assert rep.climate_bill.change_whole_field.p50 == round(exact)
    assert rep.climate_bill.change_whole_field.unit == "USD/year"


def test_bad_years_per_priced_rotation():
    rep, _ = report()
    m, _ = service.resolve_inputs(EconomicsRequest(field_id="x").your_numbers)
    sm = money.season_margins(["maize", "soybean"], "soybean", np.tile(BASE * 0.8, (2, 1)), [0, 0], False, m)
    b = next(x for x in rep.bad_years if x.rotation_id == "MS")
    assert b.losing_season_share == round(money.losing_season_share(sm), 3)
    assert b.worst_season_usd_ha == round(float(sm.min()))
    assert b.cash_cushion_worst_usd_ha == round(float(money.cash_cushion(sm).max()))
    assert b.runs == 2 and b.seasons_total == 2
    assert [x.rotation_id for x in rep.bad_years] == ["MS", "MSO"]


def test_only_one_priced_rotation():
    rep, port = report(rotations=[MS, WS])
    assert rep.who_earns_most is None and rep.climate_bill.best_alternative is None
    assert rep.excluded_rotations[0].rotation_id == "WS"
    assert "no Iowa price" in rep.excluded_rotations[0].reason
    assert port.seen_rotations == {"MS"}  # the unpriced rotation never reaches the Simulator


def test_unpriced_yours_is_invalid():
    with pytest.raises(service.InvalidRequest, match="no Iowa price"):
        report(rotations=[WS, MS])


def test_your_numbers_for_unpriced_crop_rejected():
    with pytest.raises(service.InvalidRequest):
        report(your_numbers={"prices_usd_t": {"winter_wheat": 200}})
    with pytest.raises(service.InvalidRequest):
        report(price_crop="sunflower")


def test_own_land_raises_margin_by_rent():
    rent, _ = report()
    own, _ = report(your_numbers={"land": "own"})
    assert abs((own.climate_bill.today.p50 - rent.climate_bill.today.p50) - p.RENT_USD_HA) <= 1
    assert s.OWN_LAND in own.notes and s.RENT_LAND in rent.notes
    r = next(i for i in own.inputs_used if i.id == "rent")
    assert r.source == "Your number" and r.display == "own land" and r.value == 0


def test_your_price_is_used_and_labelled():
    rep, _ = report(your_numbers={"prices_usd_t": {"maize": 250}})
    i = next(i for i in rep.inputs_used if i.id == "price.maize")
    assert i.value == 250 and i.source == "Your number" and i.kind == "scenario"


def test_defaulted_rotations():
    rep, _ = report(rotations=None)
    assert rep.yours_assumed and rep.yours_rotation_id == "B"
    assert any(a.source == p.DEFAULT_YOURS_SOURCE for a in rep.assumptions)


def test_projection_drives_grid_rain_and_your_cell():
    rep, port = report(scenario={"projection": "ssp245_2050s", "years": 2})
    g = rep.who_earns_most
    assert g.rain_change_pct == -6 and g.rain_change_source.startswith("the projection")
    assert g.your_cell.row == 2 and g.your_cell.exact is False
    grid_runs = [sc for sc in port.seen if sc.projection is None and sc.rain_change_pct == -6]
    assert len(grid_runs) == len(g.warming_c)
    assert rep.scenario_label == "NASA 2050s, Middle of the road"


def test_grid_shape_and_your_cell_exact():
    rep, _ = report()
    g = rep.who_earns_most
    assert len(g.cells) == 5 and all(len(r) == 5 for r in g.cells)
    assert (g.your_cell.row, g.your_cell.col, g.your_cell.exact) == (2, 2, True)
    assert g.sentence


def test_today_run_reused_for_zero_row():
    _, port = report()
    keys = [sc.model_dump_json() for sc in port.seen]
    assert len(keys) == len(set(keys))  # each scenario runs once
    assert len(keys) == 3 + 5 - 2  # today == 0 °C row, scenario == +2 °C row


def test_irrigation_assumption_only_when_irrigated():
    dry, _ = report()
    wet, _ = report(scenario={"temp_delta_c": 2, "years": 2, "irrigation": "full"})
    assert not any(a.topic.startswith("Irrigation") for a in dry.assumptions)
    assert any(a.topic == "Irrigation per weather year" for a in wet.assumptions)


def test_scenario_that_helps():
    rep, _ = report(scenario={"temp_delta_c": -1, "years": 2})
    assert rep.climate_bill.change.p50 > 0
    assert "a year more" in rep.climate_bill.sentence
    assert rep.climate_bill.best_alternative.wins_back_share is None


def test_notes_carry_caveat_and_not_calibrated():
    rep, _ = report(port=FakePort(calibrated=False))
    assert s.CAVEAT in rep.notes and s.NOT_CALIBRATED in rep.notes
    assert rep.calibrated is False


def test_defaults():
    d = service.get_defaults(None, "demo", port=FakePort())
    assert d.default_yours_rotation_id == "B"
    ids = {i.id for i in d.inputs}
    assert {"price.maize", "cost.maize", "cost_after_self.maize", "rent", "irrigation", "cover_crop"} <= ids
    assert all(i.kind == "scenario" and i.source for i in d.inputs)
