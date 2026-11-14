"""Several farms, each with an optional point where its map opens."""
from sqlalchemy import func, select

from app.modules.croptwin.models import CropHistory, Field, SoilLayer
from app.modules.croptwin.seed import seed_demo_farm

SQUARE = {"type": "Polygon", "coordinates": [[[-93.462, 42.030], [-93.458, 42.030], [-93.458, 42.033],
                                              [-93.462, 42.033], [-93.462, 42.030]]]}


def test_create_farm_with_point_and_list(client, db_session):
    seed_demo_farm(db_session)
    r = client.post("/api/farms", json={"name": "Plovdiv plot", "region": "Plovdiv, Bulgaria",
                                        "location_lat": 42.1354, "location_lon": 24.7453})
    assert r.status_code == 201
    farm = r.json()
    assert (farm["location_lat"], farm["location_lon"]) == (42.1354, 24.7453)
    listed = {f["id"]: f["field_count"] for f in client.get("/api/farms").json()}
    assert listed == {"demo": 3, farm["id"]: 0}
    assert client.get("/api/farms/demo").json()["location_lat"] is None  # existing farms unchanged


def test_invalid_or_half_point_is_422(client):
    assert client.post("/api/farms", json={"name": "x", "location_lat": 95, "location_lon": 10}).status_code == 422
    assert client.post("/api/farms", json={"name": "x", "location_lat": 10, "location_lon": 181}).status_code == 422
    assert client.post("/api/farms", json={"name": "x", "location_lat": 10}).status_code == 422
    farm_id = client.post("/api/farms", json={"name": "x"}).json()["id"]
    assert client.patch(f"/api/farms/{farm_id}", json={"location_lon": 10}).status_code == 422


def test_update_and_clear_point(client):
    farm_id = client.post("/api/farms", json={"name": "F"}).json()["id"]
    r = client.patch(f"/api/farms/{farm_id}", json={"location_lat": -33.9, "location_lon": 18.4, "name": "Cape"})
    assert (r.json()["location_lat"], r.json()["location_lon"], r.json()["name"]) == (-33.9, 18.4, "Cape")
    r = client.patch(f"/api/farms/{farm_id}", json={"region": "Western Cape"})
    assert r.json()["location_lat"] == -33.9  # untouched when not sent
    r = client.patch(f"/api/farms/{farm_id}", json={"location_lat": None, "location_lon": None})
    assert (r.json()["location_lat"], r.json()["location_lon"]) == (None, None)


def test_delete_farm_cascades_to_fields_soil_and_history(client, db_session):
    farm_id = client.post("/api/farms", json={"name": "Temp", "location_lat": 42.03, "location_lon": -93.46}).json()["id"]
    field_id = client.post(f"/api/farms/{farm_id}/fields", json={"name": "A", "boundary": SQUARE}).json()["id"]
    client.post(f"/api/farms/{farm_id}/fields/{field_id}/soil/prefill")
    client.post(f"/api/farms/{farm_id}/fields/{field_id}/crop-history", json={"season_year": 2024, "crop_id": "maize"})

    assert client.delete(f"/api/farms/{farm_id}").status_code == 204
    assert client.get(f"/api/farms/{farm_id}").status_code == 404
    for model in (Field, SoilLayer, CropHistory):
        column = model.farm_id if model is Field else model.field_id
        assert db_session.scalar(select(func.count()).select_from(model).where(
            column == (farm_id if model is Field else field_id))) == 0
    assert client.delete(f"/api/farms/{farm_id}").status_code == 404
