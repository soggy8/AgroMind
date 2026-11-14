"""NASA colour classes (from real GIBS colour maps) and NASA POWER weather (from a real saved response). No network."""
import json
from datetime import date
from pathlib import Path

import pytest

from app.modules.croptwin import colour_classes, weather_source
from app.modules.croptwin.seed import seed_demo_farm

FIXTURES = Path(__file__).parent / "fixtures"
SMAP = colour_classes.parse((FIXTURES / "colormap_SMAP_Analyzed_Soil_Moisture.xml").read_text(encoding="utf-8"))
IMERG = colour_classes.parse((FIXTURES / "colormap_GPM_Precipitation_Rate.xml").read_text(encoding="utf-8"))
POWER = json.loads((FIXTURES / "power_daily_42.03_-93.46.json").read_text(encoding="utf-8"))


def test_smap_colour_maps_to_nasa_class():
    # Real entry: <ColorMapEntry rgb="255,250,0" ... value="[0.105,0.107)" ref="39"/>
    r = colour_classes.classify(SMAP, (255, 250, 0), 255)
    assert (r.status, r.low, r.high, r.range_text) == ("class", 0.105, 0.107, "[0.105,0.107)")
    assert r.units == "m³/m³"


def test_imerg_open_ended_classes_and_rain_or_snow():
    first = colour_classes.classify(IMERG, (0, 118, 78), 255)  # value="[0.1,0.1059)"
    assert (first.low, first.high, first.title, first.units) == (0.1, 0.1059, "Rain Rate", "mm/hr")
    top = colour_classes.classify(IMERG, (58, 3, 48), 255)  # value="[53.0884,+INF)"
    assert (top.low, top.high) == (53.0884, None)


def test_transparent_unknown_and_nodata():
    hidden = colour_classes.classify(IMERG, (0, 0, 0), 0)
    assert hidden.status == "transparent" and hidden.label == "Insignificant, No Data"
    assert colour_classes.classify(SMAP, (1, 2, 3), 255).status == "unknown"  # never a nearest-colour guess


def test_colour_route(client, monkeypatch):
    monkeypatch.setattr(colour_classes, "_fetch",
                        lambda name: (FIXTURES / f"colormap_{name}.xml").read_text(encoding="utf-8"))
    colour_classes._cache.clear()
    r = client.get("/api/farms/nasa-colour", params={"colormap": "SMAP_Analyzed_Soil_Moisture", "r": 255, "g": 250, "b": 0})
    assert r.status_code == 200 and r.json()["range_text"] == "[0.105,0.107)"
    assert client.get("/api/farms/nasa-colour", params={"colormap": "../etc", "r": 1, "g": 1, "b": 1}).status_code == 422

    def missing(name):
        raise ValueError("Unknown colour map name.")
    monkeypatch.setattr(colour_classes, "_fetch", missing)
    assert client.get("/api/farms/nasa-colour", params={"colormap": "Nope_Map", "r": 1, "g": 1, "b": 1}).status_code == 404


@pytest.fixture
def power(monkeypatch):
    weather_source._cache.clear()
    calls = []
    monkeypatch.setattr(weather_source, "_fetch", lambda lat, lon, start, end: calls.append((lat, lon, start, end)) or POWER)
    return calls


def test_weather_parsed_with_powers_own_units(power):
    w = weather_source.recent_weather(42.03, -93.46, today=date(2026, 11, 14))
    assert power == [(42.03, -93.46, date(2026, 10, 15), date(2026, 11, 13))]  # 30 days ending yesterday
    assert w.sources == ["GEOSIT", "FLASHFLUX", "POWER"] and (w.start, w.end) == ("2026-10-14", "2026-11-13")
    by_id = {s.id: s for s in w.series}
    assert (by_id["PRECTOTCORR"].units, by_id["T2M_MAX"].units, by_id["ALLSKY_SFC_SW_DWN"].units) == ("mm/day", "C", "MJ/m^2/day")
    assert by_id["T2M_MAX"].dates[-3:] == ["2026-11-11", "2026-11-12", "2026-11-13"]
    assert by_id["T2M_MAX"].values[-3:] == [15.49, None, None]  # POWER's -999 fill becomes "no value"
    assert by_id["PRECTOTCORR"].values[-3] == 0.95


def test_weather_cached_and_routed(client, db_session, power):
    seed_demo_farm(db_session)
    r = client.get("/api/farms/demo/fields/north/weather")
    assert r.status_code == 200 and len(r.json()["series"]) == 4
    client.get("/api/farms/demo/fields/north/weather")
    assert len(power) == 1  # second request served from the cache
    assert client.get("/api/farms/demo/fields/nope/weather").status_code == 404


def test_weather_unavailable_is_503(client, db_session, monkeypatch):
    seed_demo_farm(db_session)
    weather_source._cache.clear()

    def down(*args):
        raise weather_source.WeatherUnavailable("Couldn't reach NASA POWER (ConnectError).")
    monkeypatch.setattr(weather_source, "_fetch", down)
    r = client.get("/api/farms/demo/fields/north/weather")
    assert r.status_code == 503 and "NASA POWER" in r.json()["detail"]
