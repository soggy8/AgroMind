from app.modules.economics import sentences as s
from app.modules.economics.money import SwitchPoints

NAMES = {"A": "Maize → Soybean", "B": "Maize → Soybean → Oats"}


def test_money_units():
    assert s.money(190, "metric") == "$190/ha"
    assert s.money(-190, "us") == "$77/ac"


def test_scenario_label():
    assert s.scenario_label(2, -20, None) == "+2 °C, -20% rain"
    assert s.scenario_label(2, -20, "NASA 2050s, Middle of the road") == "NASA 2050s, Middle of the road"


def test_negative_bill_with_win_back():
    got = s.climate_bill("Maize → Soybean", "+2 °C, -20% rain", -190, "Maize → Soybean → Oats", 70, 70 / 190,
                         "metric")
    assert got == ("In this scenario (+2 °C, -20% rain), Maize → Soybean earns about $190/ha a year less than in "
                   "today's climate. Switching to Maize → Soybean → Oats wins back about $70/ha of that (37%).")


def test_negative_bill_no_better_alternative_and_more_than_makes_up():
    assert s.climate_bill("Y", "x", -100, "B", -5, None, "metric").endswith("None of the other rotations earns more "
                                                                           "in this scenario.")
    assert s.climate_bill("Y", "x", -100, None, None, None, "metric").endswith("in this scenario.")
    assert "more than makes up for it" in s.climate_bill("Y", "x", -100, "B", 150, 1.5, "metric")


def test_scenario_that_helps():
    got = s.climate_bill("Y", "-1 °C, +0% rain", 40, "B", -10, None, "metric")
    assert "a year more" in got and "%" not in got.split(")", 1)[1]
    assert "B would earn about $10/ha a year more still." in s.climate_bill("Y", "x", 40, "B", 10, None, "metric")


def test_same():
    assert s.climate_bill("Y", "x", 0.2, None, None, None, "metric").endswith("the same as in today's climate.")


def test_bad_years():
    assert s.bad_years("Y", 0, 100, 0, "metric") == "Y made money in every simulated season."
    got = s.bad_years("Y", 0.36, -410, 600, "metric")
    assert got == ("Y loses money in about 4 of every 10 seasons; the worst season loses $410/ha. "
                   "Getting through the worst run of seasons takes about $600/ha in cash.")
    assert "about 1 of every 10" in s.bad_years("Y", 0.02, -10, 0, "metric")


def test_switch_cases():
    sp = lambda *a: SwitchPoints(*a)  # noqa: E731
    assert s.switch(sp("A", (1.0, 2.0), (-15.0, -30.0), False), NAMES, "A") == (
        "Maize → Soybean stops earning most between +1 °C and +2 °C at today's prices, "
        "or when prices fall between 15% and 30%.")
    assert s.switch(sp("A", (1.0, 2.0), None, False), NAMES, "A") == (
        "Maize → Soybean stops earning most between +1 °C and +2 °C at today's prices.")
    assert s.switch(sp("A", None, (0.0, -15.0), False), NAMES, "A") == (
        "In today's climate, Maize → Soybean stops earning most when prices fall between 0% and 15%.")
    assert s.switch(sp("A", None, None, True), NAMES, "A") == "Maize → Soybean earns most everywhere on this grid."
    assert s.switch(sp("A", None, None, False), NAMES, "A").endswith("other rotations win elsewhere on the grid.")
    assert s.switch(sp("B", None, None, False), NAMES, "A") == (
        "Even in today's climate at today's prices, Maize → Soybean → Oats earns more than Maize → Soybean.")
    assert s.switch(sp(None, None, None, False), NAMES, "A") == (
        "In today's climate at today's prices, Maize → Soybean and the next rotation are too close to call.")
