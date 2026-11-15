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
    assert s.climate_bill("M", "L", -100, None, None, None, "metric") == (
        "In this scenario (L), M earns about $100/ha a year less than in today's climate."
        " There's no other priced rotation to compare.")
    tail = " None of the other rotations earns more in this scenario."
    assert s.climate_bill("M", "L", -100, "S", 0, 0.0, "metric").endswith(tail)
    assert s.climate_bill("M", "L", -100, "S", 5, None, "metric").endswith(tail)


def test_climate_bill_about_the_same():
    same = "In this scenario (L), M earns about the same as in today's climate."
    assert s.climate_bill("M", "L", 0.3, None, None, None, "metric") == same
    assert s.climate_bill("M", "L", -1, None, None, None, "us") == same  # $1/ha shows as $0/ac
    assert s.climate_bill("M", "L", 1, None, None, None, "us") == same
    assert s.climate_bill("M", "L", -1, None, None, None, "metric").startswith(
        "In this scenario (L), M earns about $1/ha a year less")


def test_climate_bill_helps():
    out = s.climate_bill("M", "L", 40, "S", 0, None, "metric")
    assert out == "In this scenario (L), M earns about $40/ha a year more than in today's climate."
    assert "%" not in out
    out2 = s.climate_bill("M", "L", 40, "S", 25, None, "metric")
    assert out2.endswith(" S would earn about $25/ha a year more still.")


def test_bad_years():
    assert s.bad_years("M", 0, 0, 0, "metric") == "M made money in every simulated season."
    out = s.bad_years("M", 0.36, -300, 500, "metric")
    assert out == ("M loses money in about 4 of every 10 simulated seasons; the worst season loses $300/ha."
                   " Getting through the worst run of seasons takes about $500/ha in cash.")
    assert s.bad_years("M", 0.01, -300, 0, "metric") == (
        "M loses money in about 1 of every 10 simulated seasons; the worst season loses $300/ha.")


def test_bad_years_every_season_and_cap_at_nine():
    nine = "M loses money in about 9 of every 10 simulated seasons;"
    assert s.bad_years("M", 0.96, -300, 0, "metric").startswith(nine)
    assert s.bad_years("M", 0.999, -300, 0, "metric").startswith(nine)
    assert s.bad_years("M", 1.0, -300, 900, "metric") == (
        "M loses money in every simulated season; the worst season loses $300/ha."
        " Getting through the worst run of seasons takes about $900/ha in cash.")


TODAY = {"warming_c": 0.0, "rain_change_pct": 0.0, "price_change_pct": 0.0, "price_crop": None}


def sp(origin="A", warming=None, price=None, everywhere=False, others=True, warming_tie=None, price_tie=None):
    return SwitchPoints(origin, warming, price, everywhere, others,
                        warming_tie_from=warming_tie, price_tie_from=price_tie)


def test_switch_cases_in_todays_climate_at_todays_prices():
    assert s.switch(sp(None), NAMES, "A", **TODAY) == (
        f"In today's climate at today's prices, {Y} and the next rotation are too close to call.")
    assert s.switch(sp("B"), NAMES, "A", **TODAY) == (
        f"Even in today's climate at today's prices, {NAMES['B']} earns more than {Y}.")
    assert s.switch(sp(warming=(1.0, 2.0), price=(-15.0, -30.0)), NAMES, "A", **TODAY) == (
        "Maize → Soybean stops earning most between +1 °C and +2 °C at today's prices,"
        " or when prices fall between 15% and 30% in today's climate.")
    assert s.switch(sp(warming=(1.0, 2.0)), NAMES, "A", **TODAY) == (
        f"{Y} stops earning most between +1 °C and +2 °C at today's prices.")
    assert s.switch(sp(price=(0.0, -15.0)), NAMES, "A", **TODAY) == (
        f"In today's climate, {Y} stops earning most when prices fall between 0% and 15%.")
    assert s.switch(sp(everywhere=True, others=False), NAMES, "A", **TODAY) == (
        f"{Y} earns most everywhere on this grid.")
    assert s.switch(sp(), NAMES, "A", **TODAY) == (
        f"{Y} earns most in today's climate at today's prices; other rotations win elsewhere on the grid.")


def test_switch_ties_only_grid():
    assert s.switch(sp(others=False), NAMES, "A", **TODAY) == (
        f"{Y} earns most or is too close to call everywhere on this grid.")


def test_switch_names_tie_rows_before_the_switch():
    assert s.switch(sp(warming=(1.0, 4.0), warming_tie=2.0), NAMES, "A", **TODAY) == (
        f"{Y} is too close to call from +2 °C and stops earning most by +4 °C at today's prices.")
    assert s.switch(sp(price=(0.0, -30.0), price_tie=-15.0), NAMES, "A", **TODAY) == (
        f"In today's climate, {Y} is too close to call when prices fall 15% and stops earning most when they fall 30%.")
    assert s.switch(sp(warming=(1.0, 2.0), price=(0.0, -30.0), price_tie=-15.0), NAMES, "A", **TODAY) == (
        f"{Y} stops earning most between +1 °C and +2 °C at today's prices, or is too close to call when prices"
        " fall 15% and stops earning most when they fall 30% in today's climate.")


def test_switch_says_todays_climate_only_when_it_is():
    dry = {**TODAY, "rain_change_pct": -20.0}
    assert s.switch(sp(None), NAMES, "A", **dry) == (
        f"In today's temperatures with 20% less rain at today's prices, {Y} and the next rotation"
        " are too close to call.")
    assert s.switch(sp(warming=(1.0, 4.0), warming_tie=2.0), NAMES, "A", **dry) == (
        f"{Y} is too close to call from +2 °C and stops earning most by +4 °C with 20% less rain at today's prices.")
    assert s.switch(sp(price=(0.0, -15.0)), NAMES, "A", **dry) == (
        f"In today's temperatures with 20% less rain, {Y} stops earning most when prices fall between 0% and 15%.")
    warm = {**TODAY, "warming_c": 0.5, "price_change_pct": -15.0}
    assert s.switch(sp("B"), NAMES, "A", **warm) == (
        f"Even in a climate +0.5 °C from today at prices 15% lower, {NAMES['B']} earns more than {Y}.")
    cool_wet = {**TODAY, "warming_c": -0.5, "rain_change_pct": 10.0, "price_change_pct": 15.0}
    assert s.switch(sp(), NAMES, "A", **cool_wet) == (
        f"{Y} earns most in a climate -0.5 °C from today with 10% more rain at prices 15% higher;"
        " other rotations win elsewhere on the grid.")
    assert "today's climate" not in s.switch(sp(None), NAMES, "A", **{**TODAY, "warming_c": 0.5})


def test_switch_names_the_price_crop_and_a_raised_anchor_price():
    soy = {**TODAY, "price_crop": "soybean"}
    assert s.switch(sp(price=(0.0, -15.0)), NAMES, "A", **soy) == (
        f"In today's climate, {Y} stops earning most when soybean prices fall between 0% and 15%.")
    assert s.switch(sp(warming=(1.0, 2.0)), NAMES, "A", **soy) == (
        f"{Y} stops earning most between +1 °C and +2 °C at today's soybean prices.")
    assert s.switch(sp(None), NAMES, "A", **{**soy, "price_change_pct": 15.0}) == (
        f"In today's climate at soybean prices 15% higher, {Y} and the next rotation are too close to call.")
    assert s.switch(sp(price=(5.0, -30.0)), NAMES, "A", **{**TODAY, "price_change_pct": 5.0}) == (
        f"In today's climate, {Y} stops earning most when prices are between 5% higher and 30% lower.")


def test_constants():
    assert s.CAVEAT.startswith("Compare rotations")
    assert s.OWN_LAND.startswith("You own the land")
