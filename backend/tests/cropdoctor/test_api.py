from datetime import date

from app.modules.cropdoctor import ports, service
from app.modules.cropdoctor.indicators.vegetation import Reading
from app.modules.croptwin import service as croptwin
from app.modules.croptwin.schemas import FarmCreate, FieldCreate, GeoJSONPolygon

BASE = "/api/farms/demo/health"


def _other_farm(db_session):
    farm = croptwin.create_farm(db_session, FarmCreate(name="Elsewhere"))
    ring = [(9.0, 45.0), (9.001, 45.0), (9.001, 45.001), (9.0, 45.001), (9.0, 45.0)]
    croptwin.create_field(db_session, farm.id, FieldCreate(name="Plot", boundary=GeoJSONPolygon(coordinates=[ring])))
    return farm


def test_default_is_the_2012_replay_with_a_watch_on_west(api):
    body = api.get(BASE).json()
    assert (body["as_of"], body["is_replay"], body["replay_date"]) == ("2012-08-12", True, "2012-08-12")
    west = next(f for f in body["findings"] if f["field_id"] == "west")
    assert (west["severity"], west["headline"], west["since"]) == ("watch", "Possible water stress", "2012-07-11")
    assert [e["id"] for e in west["explanations"]] == ["water_stress"]
    assert west["caveat"] == "Satellites can't rule out pests or disease."
    assert [i["id"] for i in west["evidence"]] == ["greenness", "rain_30d", "tmax_30d"]
    assert [f["field_id"] for f in body["findings"]] == ["west"]
    by_id = {f["id"]: f for f in body["fields"]}
    assert by_id["west"]["status"] == "watch"
    assert by_id["creek"]["status"] == "normal" and by_id["north"]["status"] == "normal"
    assert by_id["creek"]["crop"] == {"label": "Corn", "year": 2012, "kind": "modelled",
                                      "source": "USDA Cropland Data Layer"}
    assert by_id["west"]["crop"]["label"].startswith("Mixed: ")
    assert by_id["north"]["crop"]["label"] == "Mixed: Soybeans and Corn"
    assert [i["id"] for i in body["weather"]] == ["rain_30d", "tmax_30d", "et0_30d"]
    assert body["weather"][2]["value"]["kind"] == "modelled"
    assert len(body["assumptions"]) >= 6 and body["greenness_available"] is True


def _walk(node, found):
    if isinstance(node, dict):
        if "value" in node and "unit" in node:
            found.append(node)
        for v in node.values():
            _walk(v, found)
    elif isinstance(node, list):
        for v in node:
            _walk(v, found)


def test_every_value_has_a_kind_and_a_source(api):
    found: list[dict] = []
    _walk(api.get(BASE).json(), found)
    assert len(found) >= 9
    for v in found:
        assert v["kind"] in {"observed", "modelled", "scenario"} and v["source"]


def test_an_unfinished_period_is_not_shown(api):
    body = api.get(BASE, params={"as_of": "2012-08-11"}).json()
    assert not [f for f in body["findings"] if f["field_id"] == "creek"]
    creek = next(f for f in body["fields"] if f["id"] == "creek")
    assert creek["greenness"]["value"]["period_end"] == "2012-08-03"


def test_out_of_season_checks_are_paused(api, db_session):
    h = service.get_health(db_session, "demo", date(2026, 11, 10), today=date(2026, 11, 14))
    assert h.findings == [] and {f.status for f in h.fields} == {"paused"} and h.is_replay is True
    assert next(f for f in h.fields if f.id == "north").crop.source == "Farm profile"
    assert service.get_health(db_session, "demo", date(2026, 11, 14), today=date(2026, 11, 14)).is_replay is False


def test_an_early_year_has_values_without_a_comparison(api):
    creek = next(f for f in api.get(BASE, params={"as_of": "2003-07-20"}).json()["fields"] if f["id"] == "creek")
    assert creek["greenness"]["value"]["value"] is not None and creek["greenness"]["value"]["normal"] is None
    assert creek["status"] == "no_data"


def test_a_winter_date_does_not_crash(api):
    assert api.get(BASE, params={"as_of": "2012-01-05"}).status_code == 200


def test_a_clouded_period_keeps_the_last_clear_value(api, monkeypatch):
    real = ports.load_greenness

    def patched(field_id):
        rs = real(field_id)
        if field_id == "creek":
            rs = [Reading(r.year, r.doy, None, r.satellite, 0, r.points_total) if (r.year, r.doy) == (2012, 209) else r
                  for r in rs]
        return rs

    monkeypatch.setattr(ports, "load_greenness", patched)
    creek = next(f for f in api.get(BASE).json()["fields"] if f["id"] == "creek")
    assert creek["greenness"]["value"]["period_end"] == "2012-08-03"
    assert creek["status_note"] == "No clear image since 3 Aug 2012."


def test_future_and_malformed_dates_are_rejected(api):
    assert api.get(BASE, params={"as_of": "2999-01-01"}).status_code == 422
    assert api.get(BASE, params={"as_of": "yesterday"}).status_code == 422


def test_unknown_farm_is_404(api):
    assert api.get("/api/farms/nope/health").status_code == 404


def test_a_farm_with_no_fields(api, db_session):
    farm = croptwin.create_farm(db_session, FarmCreate(name="Empty"))
    body = api.get(f"/api/farms/{farm.id}/health").json()
    assert (body["fields"], body["findings"], body["weather"], body["greenness_available"]) == ([], [], [], False)


def test_another_farm_gets_weather_and_a_plain_message(api, db_session, monkeypatch):
    farm = _other_farm(db_session)
    monkeypatch.setattr(ports, "weather_for", lambda lat, lon, as_of: ports.load_weather())
    body = api.get(f"/api/farms/{farm.id}/health", params={"as_of": "2020-07-15"}).json()
    assert body["greenness_available"] is False and len(body["weather"]) == 3
    assert body["fields"][0]["status_note"] == "Greenness isn't available for this farm yet."
    assert body["fields"][0]["status"] == "no_data" and body["fields"][0]["season"] == []
    assert body["replay_date"] is None


def test_a_weather_outage_is_503_with_a_sentence(api, db_session, monkeypatch):
    farm = _other_farm(db_session)

    def boom(lat, lon, as_of):
        raise ports.DataUnavailable("Couldn't reach NASA POWER.")

    monkeypatch.setattr(ports, "weather_for", boom)
    r = api.get(f"/api/farms/{farm.id}/health")
    assert r.status_code == 503 and "NASA POWER" in r.json()["detail"]
