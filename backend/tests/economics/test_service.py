"""Report assembly with a fake port: hand-made relative yields, so the expected money is known by hand.

The fake grows one season a year (seasons == years). Each track has one relative yield in today's climate
(BASE), and every °C of warming takes SLOPE off it; the "local" heat response takes half as much.
"""
from dataclasses import replace

import numpy as np
import pytest

from app.modules.economics import money, ports, service
from app.modules.economics.parameters import (CROP_MONEY, DEFAULT_YOURS_SOURCE, NEAR_TIE_SOURCE, RENT_SOURCE,
                                              RENT_USD_HA)
from app.modules.economics.schemas import EconomicsRequest, EconScenario, RotationInput, YourNumbers
from app.modules.economics.sentences import CAVEAT, NOT_CALIBRATED, OWN_LAND

M, S = CROP_MONEY["maize"], CROP_MONEY["soybean"]
RM, RS = M.price_usd_t * M.typical_yield_t_ha, S.price_usd_t * S.typical_yield_t_ha  # revenue at relative yield 1
CM, CS = M.cost_before_rent_usd_ha + RENT_USD_HA, S.cost_before_rent_usd_ha + RENT_USD_HA  # cost incl. rent

BASE = (1.2, 0.8)                         # relative yield per track, today's climate
SLOPE = {"maize": 0.10, "soybean": 0.05}  # relative yield lost per °C with the published response; others none
AREA = 80.0

MS = RotationInput(id="B", name="Maize → Soybean", crops=["maize", "soybean"])
SS = RotationInput(id="S", name="Continuous soybean", crops=["soybean"])
MM = RotationInput(id="A", name="Continuous maize", crops=["maize"])
WS = RotationInput(id="W", name="Wheat → Soybean", crops=["winter_wheat", "soybean"])
X = RotationInput(id="X", name="Maize → Soybean, other seed", crops=["maize", "soybean"])
IRRIGATION_TOPICS = {"Irrigation cost", "Irrigation per weather year"}


class FakePort:
    def __init__(self, calibrated: bool = True):
        self.calibrated = calibrated
        self.calls: list[tuple[EconScenario, list[str]]] = []

    def field_info(self, session, farm_id, field_id):
        return ports.FieldInfo(field_id=field_id, name="North field", area_ha=AREA, current_crop_id="soybean")

    def suggested_rotations(self, session, farm_id):
        return [MM, MS, RotationInput(id="C", name="Maize → Soybean → Oats", crops=["maize", "soybean", "oats"])]

    def projection(self, session, farm_id, projection_id):
        return ports.ProjectionDelta(id=projection_id, label="NASA 2050s, SSP2-4.5", temp_change_c=2.4,
                                     rain_change_pct=-6.0)

    def run(self, session, farm_id, field_id, rotations, scenario, include_economics=False):
        self.calls.append((scenario, [r.id for r in rotations]))
        warming = 2.4 if scenario.projection else scenario.temp_delta_c
        scale = 1.0 if scenario.heat_response == "published" else 0.5
        irrigation = 0.0 if scenario.irrigation == "none" else 100.0
        out = {}
        for r in rotations:
            crops = tuple(r.crops[i % len(r.crops)] for i in range(scenario.years))
            yields = np.array([[b - SLOPE.get(c, 0.0) * scale * warming for b in BASE] for c in crops])
            out[r.id] = ports.RotationRun(r.id, crops, yields, (irrigation,) * len(crops), None)
        return ports.Run(rotations=out, calibrated=self.calibrated, ensemble_start_years=[2001, 2002],
                         data_note="Fake weather.", model_version="fake-1")


class GapPort(FakePort):
    """Rotation X is yours (B) with less maize: at today's prices it earns gap[warming] a year less than B.

    Two years hold one maize season, so a maize relative yield lower by 2 x gap / RM takes gap off X's
    annual margin; a price change p scales that to gap x (1 + p). Near ties are under $45/ha a year.
    """
    def __init__(self, gap: dict[float, float]):
        super().__init__()
        self.gap = gap

    def run(self, session, farm_id, field_id, rotations, scenario, include_economics=False):
        out = super().run(session, farm_id, field_id, rotations, scenario, include_economics)
        if "X" in out.rotations:
            rr = out.rotations["X"]
            maize = [i for i, c in enumerate(rr.season_crops) if c == "maize"]
            y = rr.track_yields.copy()
            y[maize] -= 2 * self.gap[scenario.temp_delta_c] / RM
            out.rotations["X"] = replace(rr, track_yields=y)
        return out


def report(port=None, **kw):
    kw.setdefault("rotations", [MS, SS, MM])
    kw.setdefault("scenario", EconScenario(temp_delta_c=2, years=2))
    return service.build_report(None, "demo", EconomicsRequest(field_id="north", **kw), port=port or FakePort())


def test_climate_bill_and_win_back():
    port = FakePort()
    bill = report(port).climate_bill
    change = -(0.2 * RM + 0.1 * RS) / 2  # maize loses 0.2 and soybean 0.1 of a yield at +2 °C, over 2 years
    assert bill.change.p50 < 0 and abs(bill.change.p50 - change) <= 0.5
    # per track: continuous soybean's scenario margin minus yours; p50 of two tracks is their mean
    yours = [((b - 0.2) * RM + (b - 0.1) * RS - CM - CS) / 2 for b in BASE]
    soy = [(b - 0.1) * RS - CS for b in BASE]
    wins_back = np.mean([s - y for s, y in zip(soy, yours)])
    alt = bill.best_alternative
    assert alt.rotation_id == "S" and abs(alt.wins_back_usd_ha - wins_back) <= 0.5
    assert alt.wins_back_share == pytest.approx(wins_back / -change, abs=0.005)
    assert "wins back" in bill.sentence
    assert bill.other_heat_response == "local"
    assert abs(bill.other_heat_response_change_usd_ha - change / 2) <= 1
    local = [sc for sc, _ in port.calls if sc.heat_response == "local"]
    assert len(local) == 1 and local[0].temp_delta_c == 2


def test_whole_field_uses_area():
    rep = report()
    bill = rep.climate_bill
    assert rep.area.value_ha == AREA and rep.area.kind == "observed"
    assert bill.change_whole_field.p50 == round(bill.change.p50 * AREA)
    assert bill.change_whole_field.unit == "USD/year" and bill.change.unit == "USD/ha/year"


def test_bad_years_per_priced_rotation():
    by_id = {b.rotation_id: b for b in report().bad_years}
    assert list(by_id) == ["B", "S", "A"]
    b = by_id["B"]  # +2 °C seasons: track 1.2 -> [1.0 RM - CM, 1.1 RS - CS] (both > 0), track 0.8 -> both < 0
    worst, other = 0.6 * RM - CM, 0.7 * RS - CS
    assert b.losing_season_share == 0.5 and b.seasons_total == 4
    assert abs(b.worst_season_usd_ha - worst) <= 0.5
    assert abs(b.cash_cushion_worst_usd_ha - -(worst + other)) <= 0.5
    assert b.losing_runs == 1 and b.runs == 2
    assert b.annual_margin.unit == "USD/ha/year" and b.season_margin.unit == "USD/ha/season"
    s = by_id["S"]
    assert s.losing_season_share == 0.5 and abs(s.worst_season_usd_ha - other) <= 0.5
    assert b.sources == [M.sources["price"], M.sources["yield"], M.sources["cost"],
                         S.sources["price"], S.sources["yield"], S.sources["cost"], RENT_SOURCE]
    assert M.sources["price"] not in s.sources and RENT_SOURCE in s.sources  # only that rotation's crops


def test_only_one_priced_rotation():
    port = FakePort()
    rep = report(port, rotations=[MS, WS])
    assert rep.who_earns_most is None and rep.climate_bill.best_alternative is None
    assert rep.excluded_rotations[0].rotation_id == "W"
    assert [b.rotation_id for b in rep.bad_years] == ["B"]
    assert all(ids == ["B"] for _, ids in port.calls)


def test_unpriced_yours_is_422_message():
    with pytest.raises(service.InvalidRequest, match="no Iowa price"):
        report(rotations=[WS, MS])


def test_your_numbers_for_unpriced_crop_rejected():
    with pytest.raises(service.InvalidRequest, match="Winter wheat"):
        report(your_numbers=YourNumbers(prices_usd_t={"winter_wheat": 200}))
    with pytest.raises(service.InvalidRequest, match="Sunflower"):
        report(price_crop="sunflower")


def test_own_land_raises_margin_by_rent():
    rent = report()
    own = report(your_numbers=YourNumbers(land="own"))
    diff = own.climate_bill.today.p50 - rent.climate_bill.today.p50
    assert abs(diff - RENT_USD_HA) <= 1
    assert OWN_LAND in own.notes
    rent_input = next(i for i in own.inputs_used if i.id == "rent")
    assert rent_input.source == "Your number" and rent_input.value == 0 and rent_input.display == "own land"
    own_with_rent = report(your_numbers=YourNumbers(land="own", rent_usd_ha=500))
    assert own_with_rent.climate_bill.today == own.climate_bill.today


def test_defaulted_rotations():
    rep = report(rotations=None)
    assert rep.yours_assumed and rep.yours_rotation_id == "B"
    assert [b.rotation_id for b in rep.bad_years] == ["B", "A", "C"]
    assert any(a.source == DEFAULT_YOURS_SOURCE for a in rep.assumptions)


def test_projection_drives_grid_rain_and_your_cell():
    port = FakePort()
    rep = report(port, scenario=EconScenario(projection="ssp245_2050s", years=2))
    who = rep.who_earns_most
    assert who.rain_change_pct == -6 and who.rain_change_source == "the projection's May-Sep median rain change"
    assert who.your_cell.row == 2 and who.your_cell.exact is False
    grid_runs = [sc for sc, _ in port.calls if sc.rain_change_pct == -6]
    assert sorted(sc.temp_delta_c for sc in grid_runs) == [0, 1, 2, 3, 4]
    assert all(sc.projection is None for sc in grid_runs)
    assert rep.scenario_label == "NASA 2050s, SSP2-4.5"


def test_irrigation_assumption_only_when_irrigated():
    dry = report(scenario=EconScenario(temp_delta_c=2, years=2, irrigation="none"))
    wet = report(scenario=EconScenario(temp_delta_c=2, years=2, irrigation="full"))
    assert not IRRIGATION_TOPICS & {a.topic for a in dry.assumptions}
    assert IRRIGATION_TOPICS <= {a.topic for a in wet.assumptions}
    # 100 mm a season at $0.50/mm/ha, two seasons over two years
    assert abs(wet.climate_bill.today.p50 - (dry.climate_bill.today.p50 - 50)) <= 1


def test_notes_carry_caveat_and_not_calibrated():
    rep = report(FakePort(calibrated=False))
    assert CAVEAT in rep.notes and NOT_CALIBRATED in rep.notes
    assert "Fake weather." in rep.notes and rep.calibrated is False


def test_identical_runs_are_reused():
    port = FakePort()
    report(port)  # +2 °C, rain 0: today is grid row 0 and the scenario is grid row 2
    keys = [(sc.temp_delta_c, sc.rain_change_pct, sc.projection, sc.heat_response) for sc, _ in port.calls]
    assert len(keys) == len(set(keys)) == 6  # today, scenario, other, rows +1, +3, +4


def test_grid_matches_climate_bill_and_applies_prices():
    rep = report(price_change_pct=10)
    who, bill = rep.who_earns_most, rep.climate_bill
    assert len(who.cells) == 5 and all(len(row) == 5 for row in who.cells)
    assert (who.your_cell.row, who.your_cell.col, who.your_cell.exact) == (2, 3, False)  # +10 % is nearest +15 %
    zero = who.price_change_pct.index(0)
    assert who.cells[2][zero].margin_p50_usd_ha["B"] < who.cells[2][zero + 1].margin_p50_usd_ha["B"]
    # the 0 % column of row +2 °C repeats the scenario at today's prices
    plain = report().climate_bill
    assert abs(who.cells[2][zero].margin_p50_usd_ha["B"] - plain.scenario.p50) <= 1
    assert bill.scenario.p50 > plain.scenario.p50  # the requested +10 % prices reach the climate bill
    # 0 °C, 0 %: Maize → Soybean about $145/ha a year, continuous soybean about $146/ha: a near tie
    assert who.sentence == ("In today's climate at today's prices, Maize → Soybean and the next rotation"
                            " are too close to call.")
    assert NEAR_TIE_SOURCE in who.sources and {M.sources["price"], S.sources["price"], RENT_SOURCE} <= set(who.sources)
    assert len(who.sources) == len(set(who.sources))


def test_defaults_and_inputs_used():
    d = service.get_defaults(None, "demo", port=FakePort())
    assert d.default_yours_rotation_id == "B" and [r.id for r in d.suggested_rotations] == ["A", "B", "C"]
    ids = {i.id for i in d.inputs}
    assert ids == {f"{k}.{c}" for k in ("price", "yield", "cost") for c in CROP_MONEY} | {
        "cost_after_self.maize", "rent", "irrigation", "cover_crop"}
    price = next(i for i in d.inputs if i.id == "price.maize")
    assert price.display == "$4.60/bu" and price.source == M.sources["price"] and price.kind == "scenario"
    rep = report(your_numbers=YourNumbers(prices_usd_t={"maize": 190}))
    mine = next(i for i in rep.inputs_used if i.id == "price.maize")
    assert (mine.value, mine.display, mine.source) == (190, "$190.00/t", "Your number")
    assert "Your number" in rep.climate_bill.sources
    own_maize = report(your_numbers=YourNumbers(costs_before_rent_usd_ha={"maize": 1000}), rotations=[MM])
    assert service.AFTER_SELF_SOURCE in own_maize.bad_years[0].sources


def test_own_maize_cost_keeps_corn_after_corn_extra():
    extra = M.cost_after_self_before_rent_usd_ha - M.cost_before_rent_usd_ha  # ISU: $686.02 - $637.98 per acre
    m, inputs = service.resolve_inputs(YourNumbers(costs_before_rent_usd_ha={"maize": 1000}))
    # continuous maize after soybean: season 0 is maize after soybean, season 1 maize after maize; same yield
    seasons = money.season_margins(["maize", "maize"], "soybean", np.ones((2, 1)), [0.0, 0.0], False, m)
    assert seasons[0, 0] - seasons[1, 0] == pytest.approx(extra)
    after = next(i for i in inputs if i.id == "cost_after_self.maize")
    assert after.value == round(1000 + extra, 2) and after.source == service.AFTER_SELF_SOURCE
    default = next(i for i in service.resolve_inputs(YourNumbers())[1] if i.id == "cost_after_self.maize")
    assert default.source == M.sources["cost"]
    worst = report(rotations=[MM], your_numbers=YourNumbers(costs_before_rent_usd_ha={"maize": 1000})).bad_years[0]
    assert abs(worst.worst_season_usd_ha - (0.6 * RM - (1000 + extra + RENT_USD_HA))) <= 0.5


# 0 % column with these gaps: B, B, too close, too close, X (rows 0 to +4 °C); B everywhere on the 0 °C row
TIE_THEN_X = {0.0: 100.0, 1.0: 100.0, 2.0: 20.0, 3.0: 20.0, 4.0: -100.0}


def test_switch_sentence_counts_from_the_last_outright_win():
    who = report(GapPort(TIE_THEN_X), rotations=[MS, X]).who_earns_most
    assert [row[2].winner_rotation_id for row in who.cells] == ["B", "B", None, None, "X"]
    assert who.sentence == ("Maize → Soybean is too close to call from +2 °C and stops earning most by +4 °C"
                            " at today's prices.")


def test_switch_sentence_names_the_grid_rain_change():
    rep = report(GapPort(TIE_THEN_X), rotations=[MS, X],
                 scenario=EconScenario(temp_delta_c=2, rain_change_pct=-20, years=2))
    who = rep.who_earns_most
    assert who.rain_change_pct == -20 and "today's climate" not in who.sentence
    assert who.sentence == ("Maize → Soybean is too close to call from +2 °C and stops earning most by +4 °C"
                            " with 20% less rain at today's prices.")


def test_switch_sentence_ties_only_grid():
    gap = {**TIE_THEN_X, 4.0: 20.0}  # X never wins outright
    who = report(GapPort(gap), rotations=[MS, X]).who_earns_most
    assert {c.winner_rotation_id for row in who.cells for c in row} == {"B", None}
    assert who.sentence == "Maize → Soybean earns most or is too close to call everywhere on this grid."


def test_switch_sentence_names_the_price_crop():
    # 0 °C row: continuous soybean beats continuous maize by about $61/ha at 0 %, loses at soybean prices -15 %
    who = report(rotations=[SS, MM], price_crop="soybean").who_earns_most
    assert [c.winner_rotation_id for c in who.cells[0]] == ["A", "A", "S", "S", "S"]
    assert who.sentence == ("In today's climate, Continuous soybean stops earning most when soybean prices fall"
                            " between 0% and 15%.")


def test_single_priced_rotation_bill_sentence():
    bill = report(rotations=[MS, WS]).climate_bill
    loss = round((0.2 * RM + 0.1 * RS) / 2)  # +2 °C: maize loses 0.2 and soybean 0.1 of a yield, over 2 years
    assert bill.sentence == (f"In this scenario (+2 °C, +0% rain), Maize → Soybean earns about ${loss:,}/ha a year"
                             " less than in today's climate. There's no other priced rotation to compare.")
