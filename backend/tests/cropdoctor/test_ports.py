from datetime import date

import pytest

from app.modules.cropdoctor import ports
from app.modules.cropdoctor.indicators import vegetation
from app.modules.cropdoctor.indicators.vegetation import Reading

NORTH = [(42.03673, -93.46250), (42.03673, -93.45384), (42.04167, -93.45384), (42.04167, -93.46250)]


def test_parse_item_id():
    assert vegetation.parse_item_id("MOD13Q1.A2012193.h11v04.061.2021212102512") == (2012, 193, "Terra")
    assert vegetation.parse_item_id("MYD13Q1.A2012201.h11v04.061.2021213000009") == (2012, 201, "Aqua")


def test_period_dates_do_not_shift_in_leap_years():
    assert vegetation.period_start(2012, 193) == date(2012, 7, 11)
    assert vegetation.period_start(2011, 193) == date(2011, 7, 12)
    assert vegetation.period_end(2012, 201) == date(2012, 8, 3)
    assert vegetation.visible_from(2012, 201) == date(2012, 8, 4)
    assert vegetation.visible_from(2012, 209) == date(2012, 8, 12)
    assert vegetation.period_end(2012, 361) == date(2012, 12, 31)


def test_sample_points_are_the_centre_and_four_inset_points():
    pts = ports.sample_points(NORTH)
    assert len(pts) == 5
    assert pts[0] == pytest.approx((42.0392, -93.45817), abs=1e-5)
    assert all(42.0375 < lat < 42.0410 and -93.4610 < lon < -93.4555 for lat, lon in pts)


def test_field_mean_uses_only_good_and_marginal_points():
    mean, used = ports.field_mean([(9000.0, 0.0), (8000.0, 1.0), (2000.0, 3.0), (None, None), (-3000.0, 0.0)])
    assert mean == pytest.approx(0.85) and used == 2
    assert ports.field_mean([(2000.0, 3.0)]) == (None, 0)


def test_power_csv_fill_values_become_none(tmp_path):
    path = tmp_path / "p.csv"
    path.write_text(
        "-BEGIN HEADER-\n"
        "NASA/POWER Source Native Resolution Daily Data \n"
        "Location: latitude  42.03   longitude -93.46 \n"
        "elevation from MERRA-2: Average for 0.5 x 0.625 degree lat/lon region = 310.22 meters\n"
        "The value for missing source data that cannot be computed or is outside of the sources availability range: -999 \n"
        "-END HEADER-\n"
        "YEAR,DOY,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M\n"
        "2026,1,-8.33,-14.68,0.48,4.8,97.82,2.1\n"
        "2026,2,-9.1,-16.99,0.11,8.92,97.84,3.49\n"
        "2026,3,-0.28,-9.44,0.26,-999,97.2,2.89\n")
    w = ports.parse_power_csv(path)
    assert (w.latitude, w.longitude, w.elevation_m) == (42.03, -93.46, 310.22)
    assert w.days[date(2026, 1, 3)].solar_mj_m2 is None and w.days[date(2026, 1, 3)].tmax_c is not None


def test_readings_round_trip(tmp_path):
    rows = {"north": [Reading(2012, 193, 0.9, "Terra", 5, 5), Reading(2012, 201, None, "Aqua", 0, 5)]}
    ports.write_readings(tmp_path / "r.csv", rows, ["# test"])
    assert ports.read_readings(tmp_path / "r.csv") == rows


def test_committed_samples_cover_the_demo_fields():
    for f in ("north", "creek", "west"):
        rs = ports.load_greenness(f)
        assert rs[0].year <= 2002 and rs[-1].year == 2026
        assert {r.satellite for r in rs} == {"Terra", "Aqua"}
    assert ports.has_sample(["north", "creek", "west"]) and not ports.has_sample([]) and not ports.has_sample(["x"])
    assert ports.load_crops("creek")[2012] == "Corn" and ports.load_crops("north")[2012] == "Mixed: Soybeans and Corn"
    w = ports.load_weather()
    assert date(2012, 8, 12) in w.days and max(w.days).year == 2026
