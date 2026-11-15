"""CropTwin basics: geometry, the farm and field lifecycle, validation, soil and crop-history sources, the demo seed
and the health check. Other files cover soil prefill, overlaps, farms, place search, NASA values, deletes and route
coverage."""
import pytest

from app.modules.croptwin import geometry, service
from app.modules.croptwin.seed import seed_demo_farm

# About 500 m x 400 m near Ames, Iowa: roughly 20 ha.
SQUARE = {"type": "Polygon", "coordinates": [[[-93.46, 42.036], [-93.454, 42.036], [-93.454, 42.0396],
                                              [-93.46, 42.0396], [-93.46, 42.036]]]}


def test_area_and_centroid_from_boundary():
    assert geometry.area_ha(SQUARE) == pytest.approx(19.85, rel=0.01)
    lat, lon = geometry.centroid(SQUARE)
    assert lat == pytest.approx(42.0378) and lon == pytest.approx(-93.457)


def test_unclosed_ring_is_closed_and_bad_polygons_rejected():
    ring = SQUARE["coordinates"][0][:-1]
    closed = geometry.close_ring({"type": "Polygon", "coordinates": [ring]})
    assert closed["coordinates"][0][0] == closed["coordinates"][0][-1]
    with pytest.raises(geometry.InvalidBoundary):
        geometry.area_ha({"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [0, 0]]]})
    with pytest.raises(geometry.InvalidBoundary):
        geometry.outer_ring({"type": "Polygon", "coordinates": [[[200, 0], [1, 1], [0, 1]]]})


def test_farm_and_field_lifecycle(client):
    farm = client.post("/api/farms", json={"name": "Test Farm", "priorities": {"water": 2}}).json()
    assert farm["priorities"] == {"yield": 1.0, "water": 2.0, "risk": 1.0, "soil": 1.0, "margin": 0.0}

    r = client.post(f"/api/farms/{farm['id']}/fields",
                    json={"name": "East", "boundary": SQUARE, "current_crop_id": "maize"})
    assert r.status_code == 201
    field = r.json()
    assert field["area_source"] == "computed_from_boundary"
    assert field["area_ha"] == pytest.approx(19.85, rel=0.01)

    r = client.patch(f"/api/farms/{farm['id']}/fields/{field['id']}", json={"area_ha": 21})
    assert (r.json()["area_ha"], r.json()["area_source"]) == (21, "farmer")
    r = client.patch(f"/api/farms/{farm['id']}/fields/{field['id']}", json={"area_ha": None})
    assert r.json()["area_source"] == "computed_from_boundary"
    assert r.json()["area_ha"] == pytest.approx(19.85, rel=0.01)

    assert client.get("/api/farms").json() == [{"id": farm["id"], "name": "Test Farm", "region": None,
                                                "field_count": 1, "public": False}]
    assert client.delete(f"/api/farms/{farm['id']}").status_code == 204
    assert client.get(f"/api/farms/{farm['id']}").status_code == 404


def test_validation_errors(client):
    farm_id = client.post("/api/farms", json={"name": "F"}).json()["id"]
    flat = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [2, 2], [0, 0]]]}
    assert client.post(f"/api/farms/{farm_id}/fields", json={"name": "x", "boundary": flat}).status_code == 422
    assert client.post(f"/api/farms/{farm_id}/fields",
                       json={"name": "x", "boundary": SQUARE, "soil_texture": "mud"}).status_code == 422
    assert client.post("/api/farms/nope/fields", json={"name": "x", "boundary": SQUARE}).status_code == 404


def test_soil_layers_and_crop_history_keep_their_source(client):
    farm_id = client.post("/api/farms", json={"name": "F"}).json()["id"]
    field_id = client.post(f"/api/farms/{farm_id}/fields", json={"name": "A", "boundary": SQUARE}).json()["id"]
    base = f"/api/farms/{farm_id}/fields/{field_id}"

    soil = client.put(f"{base}/soil", json=[{"depth_top_cm": 0, "depth_bottom_cm": 30, "clay_pct": 30,
                                             "source": "Farmer lab report 2025"}]).json()["soil_layers"]
    assert soil[0]["source"] == "Farmer lab report 2025"
    assert client.put(f"{base}/soil", json=[{"depth_top_cm": 30, "depth_bottom_cm": 0,
                                             "source": "x"}]).status_code == 422

    entry = {"season_year": 2025, "crop_id": "soybean"}
    history = client.post(f"{base}/crop-history", json=entry).json()["crop_history"]
    assert history[0]["source"] == "Farmer-provided" and history[0]["yield_value"] is None
    assert client.post(f"{base}/crop-history", json=entry).status_code == 409
    assert client.delete(f"{base}/crop-history/{history[0]['id']}").status_code == 204


def test_demo_seed_matches_simulator_ids(db_session):
    assert seed_demo_farm(db_session) is True
    assert seed_demo_farm(db_session) is False
    farm = service.get_farm(db_session, "demo")
    assert [f.id for f in farm.fields] == ["north", "creek", "west"]
    assert all(len(f.soil_layers) == 3 and "SoilGrids" in f.soil_layers[0].source for f in farm.fields)
    assert all(f.crop_history == [] for f in farm.fields)  # no invented history


def test_health_reports_database(client):
    assert client.get("/api/health").json()["status"] in {"ok", "degraded"}
