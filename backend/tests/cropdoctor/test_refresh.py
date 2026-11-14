from datetime import date, timedelta

import pytest

from app.modules.cropdoctor import ports, service
from app.modules.cropdoctor.indicators.vegetation import period_start


def _power_csv(first: date, days: int) -> str:
    rows = "\n".join(
        f"{d.year},{d.timetuple().tm_yday},20.0,10.0,1.0,15.0,60.0,3.0"
        for d in (first + timedelta(n) for n in range(days)))
    return ("-BEGIN HEADER-\nNASA/POWER Source Native Resolution Daily Data\n"
            "Location: latitude  42.03   longitude -93.46\n"
            "elevation from MERRA-2: Average for 0.5 x 0.625 degree lat/lon region = 310.22 meters\n"
            "-END HEADER-\nYEAR,DOY,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M\n" + rows + "\n")


def _item_after_samples() -> str:
    last = max(ports._greenness()["north"], key=lambda r: (r.year, r.doy))  # latest sampled period
    start = period_start(last.year, last.doy) + timedelta(days=16)
    return f"MOD13Q1.A{start.year}{start.timetuple().tm_yday:03d}.h11v04.061.x"


@pytest.fixture(autouse=True)
def _reset(monkeypatch, tmp_path):
    monkeypatch.setattr(ports, "CACHE", tmp_path)
    monkeypatch.setattr(service, "_last_refresh", None)
    monkeypatch.setattr(service, "_last_failed", False)


def test_refresh_adds_newer_periods_and_weather(monkeypatch):
    before = ports.data_through()
    last_weather = max(ports._sample_weather().days)
    monkeypatch.setattr(ports, "fetch_item_ids", lambda *a, **k: [_item_after_samples()])
    monkeypatch.setattr(ports, "fetch_point", lambda *a, **k: [8000.0, 0.0])
    monkeypatch.setattr(ports, "fetch_power_csv",
                        lambda lat, lon, s, e: _power_csv(last_weather + timedelta(1), 5))
    ports.refresh(before + timedelta(days=30))
    assert ports.load_greenness("north")[-1].ndvi == pytest.approx(0.80)
    assert max(ports.load_weather().days) > before


def test_an_outage_falls_back_to_saved_data(api, db_session, monkeypatch):
    def down(*a, **k):
        raise ports.DataUnavailable("down")
    for name in ("fetch_item_ids", "fetch_point", "fetch_power_csv"):
        monkeypatch.setattr(ports, name, down)
    through = ports.data_through()
    day = through + timedelta(days=40)
    health = service.get_health(db_session, "demo", day, today=day)
    assert health.data_note.startswith("Couldn't reach NASA data. Showing saved data to ")
    assert health.data_through == ports.data_through() == through


def test_no_refresh_inside_the_sample_range(api, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("network used")
    for name in ("fetch_item_ids", "fetch_point", "fetch_power_csv"):
        monkeypatch.setattr(ports, name, boom)
    assert api.get("/api/farms/demo/health").status_code == 200
