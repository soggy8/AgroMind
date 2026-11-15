from app.modules.economics import sentences as s
from app.modules.economics.money import SwitchPoints

NAMES = {"A": "Maize → Soybean", "B": "Maize → Soybean → Oats"}
Y = NAMES["A"]


def test_money_units():
    assert s.money(190, "metric") == "$190/ha"
    assert s.money(190, "us") == "$77/ac"
    assert s.money(-190, "metric") == "$190/ha"


def test_scenario_label():
    assert s.scenario_label(2.0, -10.0, None) == "+2 °C, -10% rain"
    assert s.scenario_label(2.0, -10.0, "SSP2-4.5 2050") == "SSP2-4.5 2050"


def test_climate_bill_negative_with_win_back():
    assert s.climate_bill("Maize", "+2 °C", -100, "Soy", 37, 0.37, "metric") == (
        "In this scenario (+2 °C), Maize earns about $100/ha a year less than in today's climate."
        " Switching to Soy wins back about $37/ha of that (37%)."
    )


def test_climate_bill_share_over_one():
    out = s.climate_bill("Maize", "L", -100, "Soy", 150, 1.5, "metric")
    assert out.endswith(" Switching to Soy more than makes up for it.")


def test_climate_bill_no_alt_or_no_win_back():
    tail = " None of the other rotations earns more in this scenario."
    assert s.climate_bill("M", "L", -100, None, None, None, "metric").endswith(tail)
    assert s.climate_bill("M", "L", -100, "S", 0, 0.0, "metric").endswith(tail)
    assert s.climate_bill("M", "L", -100, "S", 5, None, "metric").endswith(tail)


def test_climate_bill_about_the_same():
    assert s.climate_bill("M", "L", 0.3, None, None, None, "metric") == (
        "In this scenario (L), M earns about the same as in today's climate.")


def test_climate_bill_helps():
    out = s.climate_bill("M", "L", 40, "S", 0, None, "metric")
    assert out == "In this scenario (L), M earns about $40/ha a year more than in today's climate."
    assert "%" not in out
    out2 = s.climate_bill("M", "L", 40, "S", 25, None, "metric")
    assert out2.endswith(" S would earn about $25/ha a year more still.")


def test_bad_years():
    assert s.bad_years("M", 0, 0, 0, "metric") == "M made money in every simulated season."
    out = s.bad_years("M", 0.36, -300, 500, "metric")
    assert "about 4 of every 10 seasons" in out
    assert out == ("M loses money in about 4 of every 10 seasons; the worst season loses $300/ha."
                   " Getting through the worst run of seasons takes about $500/ha in cash.")
    assert s.bad_years("M", 0.01, -300, 0, "metric") == (
        "M loses money in about 1 of every 10 seasons; the worst season loses $300/ha.")


def test_switch_cases():
    assert s.switch(SwitchPoints(None, None, None, False), NAMES, "A") == (
        f"In today's climate at today's prices, {Y} and the next rotation are too close to call.")
    assert s.switch(SwitchPoints("B", None, None, False), NAMES, "A") == (
        f"Even in today's climate at today's prices, {NAMES['B']} earns more than {Y}.")
    assert s.switch(SwitchPoints("A", (1.0, 2.0), (-15.0, -30.0), False), NAMES, "A") == (
        "Maize → Soybean stops earning most between +1 °C and +2 °C at today's prices,"
        " or when prices fall between 15% and 30%.")
    assert s.switch(SwitchPoints("A", (1.0, 2.0), None, False), NAMES, "A") == (
        f"{Y} stops earning most between +1 °C and +2 °C at today's prices.")
    assert s.switch(SwitchPoints("A", None, (0.0, -15.0), False), NAMES, "A") == (
        f"In today's climate, {Y} stops earning most when prices fall between 0% and 15%.")
    assert s.switch(SwitchPoints("A", None, None, True), NAMES, "A") == (
        f"{Y} earns most everywhere on this grid.")
    assert s.switch(SwitchPoints("A", None, None, False), NAMES, "A") == (
        f"{Y} earns most at today's prices and climate; other rotations win elsewhere on the grid.")


def test_constants():
    assert s.CAVEAT.startswith("Compare rotations")
    assert s.OWN_LAND.startswith("You own the land")
