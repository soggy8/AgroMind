from dataclasses import replace
from datetime import date

import pytest

from app.modules.cropdoctor import anomalies, baselines, parameters, ports
from app.modules.cropdoctor.indicators import vegetation
from app.modules.cropdoctor.indicators.vegetation import Reading

from .conftest import season


def test_normal_uses_the_ten_years_before():
    n = baselines.normal({y: 0.80 + (y - 2000) * 0.01 for y in range(2000, 2013)}, 2012)
    assert n.years == tuple(range(2002, 2012)) and n.mean == pytest.approx(0.865)
    assert (n.low, n.high) == pytest.approx((0.82, 0.91))


def test_no_normal_with_fewer_than_seven_years():
    assert baselines.normal({y: 0.8 for y in range(2006, 2012)}, 2012) is None
    assert baselines.normal({y: 0.8 for y in range(2005, 2012)}, 2012) is not None


def test_two_low_periods_in_a_row_are_a_watch():
    s = anomalies.score_season(season({193: 0.90, 201: 0.80, 209: 0.79}), 2012, date(2012, 8, 12))
    assert [x.low for x in s] == [False, True, True]
    assert anomalies.status(s) == "watch"
    assert [x.reading.doy for x in anomalies.current_run(s)] == [201, 209]


def test_a_period_that_has_not_ended_is_invisible():
    s = anomalies.score_season(season({193: 0.90, 201: 0.80, 209: 0.79}), 2012, date(2012, 8, 11))
    assert [x.reading.doy for x in s] == [193, 201] and anomalies.status(s) == "normal"


def test_twenty_percent_below_is_an_alert():
    s = anomalies.score_season(season({201: 0.80, 209: 0.70}), 2012, date(2012, 8, 12))
    assert anomalies.status(s) == "alert"


def test_outside_full_canopy_checks_are_paused():
    s = anomalies.score_season(season({201: 0.40, 209: 0.40}, base=0.60), 2012, date(2012, 8, 12))
    assert not any(x.low for x in s) and anomalies.status(s) == "paused"


def test_not_low_when_two_earlier_years_were_lower():
    rs = [r if not (r.year in (2002, 2003) and r.doy in (201, 209)) else replace(r, ndvi=0.70)
          for r in season({201: 0.80, 209: 0.80})]
    s = anomalies.score_season(rs, 2012, date(2012, 8, 12))
    assert s[-1].diff_pct < -5 and s[-1].years_below == 2      # low enough, but two earlier years were lower
    assert anomalies.status(s) == "normal"


def test_a_cloudy_period_neither_breaks_nor_extends_a_run():
    s = anomalies.score_season(season({201: 0.80, 209: None, 217: 0.80}), 2012, date(2012, 8, 20))
    assert anomalies.status(s) == "watch"
    s = anomalies.score_season(season({201: 0.80, 209: None}), 2012, date(2012, 8, 12))
    assert anomalies.status(s) == "normal"


def test_too_few_earlier_years_gives_a_value_without_a_comparison():
    rs = [r for r in season({201: 0.80, 209: 0.79}) if r.year >= 2007]
    s = anomalies.score_season(rs, 2012, date(2012, 8, 12))
    assert s[-1].normal is None and s[-1].diff_pct is None and anomalies.status(s) == "no_data"


def test_nothing_visible_yet_in_january():
    s = anomalies.score_season(season({201: 0.80}), 2012, date(2012, 1, 5))
    assert s == [] and anomalies.status(s) == "no_data"


def test_fall_before_is_the_drop_over_sixteen_days():
    s = anomalies.score_season(season({185: 0.86, 201: 0.80, 209: 0.79}), 2012, date(2012, 8, 12))
    assert anomalies.fall_before(s, anomalies.current_run(s)) == pytest.approx(0.06)


def test_real_data_on_the_demo_date():
    def run(field):
        return anomalies.score_season(ports.load_greenness(field), 2012, parameters.DEMO_AS_OF)
    west = run("west")
    assert anomalies.status(west) == "watch"
    assert vegetation.period_start(2012, anomalies.current_run(west)[0].reading.doy) == date(2012, 7, 11)
    assert anomalies.status(run("creek")) == "normal"
    assert anomalies.status(run("north")) == "normal"
