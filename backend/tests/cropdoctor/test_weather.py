from datetime import date, timedelta
from math import exp

import pytest

from app.modules.cropdoctor import ports
from app.modules.cropdoctor.indicators import weather
from app.modules.cropdoctor.indicators.weather import Day, Weather


def test_et0_matches_fao56_example_18():
    # FAO-56 Example 18 (Brussels, 6 July): Tmax 21.5, Tmin 12.3, u2 2.078 m/s, Rs 22.07 MJ/m2/day,
    # ea 1.409 kPa -> ET0 3.9 mm/day. The function takes mean RH, so derive it from ea / es.
    es = (0.6108 * exp(17.27 * 21.5 / (21.5 + 237.3)) + 0.6108 * exp(17.27 * 12.3 / (12.3 + 237.3))) / 2
    day = Day(21.5, 12.3, 0.0, 22.07, 1.409 / es * 100, 2.078)
    assert weather.et0_mm(day, 187, 50.80, 100) == pytest.approx(3.9, abs=0.15)


def test_et0_is_none_when_an_input_is_missing():
    assert weather.et0_mm(Day(21.5, 12.3, 0.0, None, 60.0, 2.0), 187, 50.8, 100) is None


def test_real_weather_on_the_demo_date():
    v = weather.weather_values(ports.load_weather(), date(2012, 8, 12))
    assert v["rain_mm"].value == pytest.approx(54.3, abs=0.5)
    assert v["rain_mm"].normal.mean == pytest.approx(119.3, abs=0.5) and v["rain_mm"].normal.years == tuple(range(2002, 2012))
    assert v["rain_mm"].years_below == 1 and v["rain_mm"].diff == pytest.approx(-54, abs=1)
    assert v["tmax_c"].value == pytest.approx(35.1, abs=0.1) and v["tmax_c"].diff == pytest.approx(5.2, abs=0.1)
    assert 3 < v["et0_mm"].value < 9


def _recent(solar_missing=5, other_missing=3, lag_all=0):
    last = date(2026, 11, 14)
    days = {}
    for i in range(60):
        d = last - timedelta(days=i)
        full = Day(10.0, 2.0, 1.0, 8.0, 70.0, 2.0)
        if i < lag_all:
            full = Day(None, None, None, None, None, None)
        elif i < other_missing:
            full = Day(None, None, None, 8.0, 70.0, 2.0)
        if i < solar_missing and i >= lag_all:
            full = Day(full.tmax_c, full.tmin_c, full.rain_mm, None, full.rh_pct, full.wind_m_s)
        days[d] = full
    return Weather(days, 42.0, -93.0, 300.0, "test")


def test_a_window_ends_on_the_last_real_day():
    v = weather.weather_values(_recent(), date(2026, 11, 14))
    assert v["rain_mm"].end == date(2026, 11, 11) and v["rain_mm"].value is not None
    assert v["et0_mm"].end == date(2026, 11, 9) and v["et0_mm"].value is not None


def test_no_value_when_the_data_is_too_old():
    w = _recent(lag_all=10)
    assert weather.weather_values(w, date(2026, 11, 14))["rain_mm"].value is None


def test_missing_days_are_left_out_not_counted_as_zero():
    w = _recent()
    assert weather.window_stat(w, date(2026, 11, 11), "tmax_c") == pytest.approx(10.0)
    assert weather.window_stat(w, date(2026, 11, 14), "tmax_c") == pytest.approx(10.0)  # 3 missing is allowed
    assert weather.window_stat(w, date(2026, 11, 14), "et0_mm") is None                 # 5 missing is too many


def test_leap_day_finds_the_same_window_in_other_years():
    by_year = weather.same_window_by_year(ports.load_weather(), date(2012, 2, 29), "rain_mm")
    assert by_year[2011] is not None and by_year[2008] is not None
