import numpy as np
from dataclasses import replace
from app.modules.economics import money, parameters as p

M = money.MoneyInputs(
    price_usd_t={"maize": 100.0, "soybean": 200.0}, typical_yield_t_ha={"maize": 10.0, "soybean": 3.0},
    cost_before_rent_usd_ha={"maize": 500.0, "soybean": 300.0}, cost_after_self_before_rent_usd_ha={"maize": 550.0},
    rent_usd_ha=100.0, irrigation_usd_per_mm_ha=1.0, cover_crop_usd_ha=50.0)
Y = np.array([[1.0, 0.5], [1.0, 1.0], [1.0, 1.0]])  # seasons x tracks

def test_season_margins_predecessor_irrigation_cover():
    m = money.season_margins(["maize", "maize", "soybean"], "soybean", Y, [0, 10, 0], True, M)
    assert m.tolist() == [[350, -150], [290, 290], [150, 150]]

def test_unknown_first_predecessor_uses_normal_cost():
    m = money.season_margins(["maize"], None, Y[:1], [0], False, M)
    assert m.tolist() == [[400, -100]]

def test_first_season_after_same_crop_uses_after_self_cost():
    assert money.season_margins(["maize"], "maize", Y[:1], [0], False, M).tolist() == [[350, -150]]

def test_own_land_and_one_crop_price_shift():
    own = replace(M, rent_usd_ha=0.0)
    m = money.season_margins(["maize", "soybean"], "soybean", Y[:2], [0, 0], False, own, price_change_pct=10, price_crop="soybean")
    assert m.tolist() == [[500, 0], [360, 360]]  # soybean revenue 660 - 300

def test_all_prices_shift():
    m = money.season_margins(["maize"], "soybean", Y[:1], [0], False, M, price_change_pct=-10)
    assert m.tolist() == [[300, -150]]

def test_annual_cushion_losing():
    m = np.array([[350.0, -150.0], [290.0, -200.0], [150.0, 150.0]])
    assert np.allclose(money.annual_margins(m, 3), [790 / 3, -200 / 3])
    assert money.cash_cushion(m).tolist() == [0.0, 350.0]
    assert money.losing_season_share(m) == 2 / 6 and money.losing_runs(m) == 1

def test_p3():
    r = money.p3(np.arange(11.0))
    assert (r.p10, r.p50, r.p90) == (1.0, 5.0, 9.0)

def test_grid_winner_and_near_tie():
    assert money.grid_winner({"A": 300.0, "B": 200.0}, 45) == ("A", False)
    assert money.grid_winner({"A": 300.0, "B": 260.0}, 45) == (None, True)
    assert money.grid_winner({"A": -5.0}, 45) == ("A", False)

W, P = [0.0, 1.0, 2.0, 3.0], [-30.0, -15.0, 0.0, 15.0]

def test_switch_points_both_axes_count_from_last_outright_win():
    g = [["B", "A", "A", "A"], ["B", "A", None, "A"], ["B", "B", "B", "A"], ["B", "B", "B", "B"]]
    sp = money.switch_points(g, W, P, "A")
    # 0 % column: A wins outright at 0 °C, too close at +1 °C, B wins at +2 °C
    assert sp == money.SwitchPoints("A", (0.0, 2.0), (-15.0, -30.0), False, True, warming_tie_from=1.0)

def test_switch_points_default_grid_ties_before_the_switch():
    # the reviewer's demo report: the 0 % column reads B, B, tie, tie, C
    w5, p5 = [0.0, 1.0, 2.0, 3.0, 4.0], [-30.0, -15.0, 0.0, 15.0, 30.0]
    g = [["B"] * 5, ["B"] * 5, ["B", "B", None, "B", "B"], [None] * 5, ["C"] * 5]
    sp = money.switch_points(g, w5, p5, "B")
    assert (sp.warming_switch, sp.warming_tie_from) == ((1.0, 4.0), 2.0)
    assert sp.price_switch is None and sp.others_win_somewhere

def test_switch_points_a_win_after_a_tie_resets_it():
    g = [["A"] * 4, [None] * 4, ["A"] * 4, ["B"] * 4]
    sp = money.switch_points(g, W, P, "A")
    assert (sp.warming_switch, sp.warming_tie_from) == ((2.0, 3.0), None)

def test_switch_points_ties_on_the_price_axis():
    g = [["B", None, "A", "A"], ["A"] * 4, ["A"] * 4, ["A"] * 4]
    sp = money.switch_points(g, W, P, "A")
    assert (sp.price_switch, sp.price_tie_from, sp.warming_switch) == ((0.0, -30.0), -15.0, None)

def test_switch_points_other_wins_at_origin_and_everywhere():
    assert money.switch_points([["B"] * 4] * 4, W, P, "A").origin_winner == "B"
    sp = money.switch_points([["A"] * 4] * 4, W, P, "A")
    assert sp.wins_everywhere and sp.warming_switch is None and sp.price_switch is None
    assert not sp.others_win_somewhere

def test_switch_points_ties_only():
    g = [["A"] * 4, ["A", None, "A", None], [None] * 4, [None] * 4]
    sp = money.switch_points(g, W, P, "A")
    assert not sp.wins_everywhere and not sp.others_win_somewhere
    assert sp.warming_switch is None and sp.price_switch is None

def test_nearest_zero():
    assert money.nearest_zero([-1.0, 0.5, 2.0]) == 1 and money.nearest_zero([-10.0, 10.0]) == 0

def test_parameters_match_isu_totals_and_sources():
    for crop, total in [("maize", 911.98), ("soybean", 679.11), ("oats", 465.0)]:
        assert abs(p.CROP_MONEY[crop].cost_before_rent_usd_ha + p.RENT_USD_HA - p.per_acre_to_per_ha(total)) < 1e-6
    after = p.CROP_MONEY["maize"].cost_after_self_before_rent_usd_ha
    assert abs(after + p.RENT_USD_HA - p.per_acre_to_per_ha(960.02)) < 1e-6
    assert p.CROP_MONEY["oats"].sources["cost"].startswith("ASSUME")
    assert all(set(c.sources) == {"price", "yield", "cost"} for c in p.CROP_MONEY.values())
