"""Place search: Nominatim responses mapped, cached, rate-limited and errors explained. No network."""
import pytest

from app.modules.croptwin import places

# Shape copied from a real Nominatim jsonv2 response (q="Ames, Iowa", 2026-11-14).
AMES = {"display_name": "Ames, Story County, Iowa, United States", "lat": "42.0267567", "lon": "-93.6170448",
        "boundingbox": ["41.9749305", "42.0779466", "-93.6987324", "-93.5214332"], "category": "boundary",
        "type": "administrative", "addresstype": "city"}


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    places._cache.clear()
    calls = []
    monkeypatch.setattr(places, "_fetch", lambda q, limit, lang: calls.append((q, lang)) or [AMES])
    return calls


def test_results_are_mapped_and_cached(client, fresh):
    r = client.get("/api/farms/places", params={"q": "Ames, Iowa", "lang": "en-US"})
    assert r.status_code == 200
    body = r.json()
    assert body["attribution"] == "© OpenStreetMap contributors (Nominatim)"
    place = body["results"][0]
    assert place == {"name": "Ames, Story County, Iowa, United States", "lat": 42.0267567, "lon": -93.6170448,
                     "bbox": [41.9749305, -93.6987324, 42.0779466, -93.5214332], "kind": "city"}
    client.get("/api/farms/places", params={"q": "  ames,   IOWA ", "lang": "en-US"})
    assert fresh == [("Ames, Iowa", "en-US")]  # the repeat came from the cache
    client.get("/api/farms/places", params={"q": "Ames, Iowa", "lang": "bg"})
    assert fresh[-1] == ("Ames, Iowa", "bg")  # another language is another lookup
    assert client.get("/api/farms/places", params={"q": "Ames", "lang": "x; drop"}).status_code == 422


def test_short_query_is_422(client):
    assert client.get("/api/farms/places", params={"q": "a"}).status_code == 422


@pytest.mark.parametrize("error, status", [(places.PlaceSearchBusy("busy"), 429),
                                           (places.PlaceSearchUnavailable("down."), 503)])
def test_upstream_errors(client, monkeypatch, error, status):
    def boom(q, limit, lang):
        raise error
    monkeypatch.setattr(places, "_fetch", boom)
    r = client.get("/api/farms/places", params={"q": "Somewhere"})
    assert r.status_code == status


def test_calls_are_spaced_a_second_apart(monkeypatch):
    clock = {"t": 100.0}
    slept = []
    monkeypatch.setattr(places.time, "monotonic", lambda: clock["t"])
    monkeypatch.setattr(places.time, "sleep", lambda s: slept.append(round(s, 3)))
    monkeypatch.setattr(places, "_last_call", 0.0)
    places._wait_turn()            # first call: no wait
    clock["t"] += 0.25
    places._wait_turn()            # 0.25 s later: waits the remaining 0.75 s
    assert slept == [0.75]
