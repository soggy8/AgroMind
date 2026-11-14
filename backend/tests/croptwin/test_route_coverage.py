"""Failure paths not covered elsewhere, and the timestamps the UI shows as "saved" / "added" / "retrieved"."""
from datetime import datetime

from app.modules.croptwin import colour_classes
from app.modules.croptwin.seed import seed_demo_farm

SQUARE = {"type": "Polygon", "coordinates": [[[-93.462, 42.030], [-93.458, 42.030], [-93.458, 42.033],
                                              [-93.462, 42.033], [-93.462, 42.030]]]}


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def test_unknown_farm_or_field_is_404_everywhere(client, db_session):
    seed_demo_farm(db_session)
    assert client.patch("/api/farms/nope", json={"name": "x"}).status_code == 404
    assert client.get("/api/farms/demo/fields/nope").status_code == 404
    assert client.patch("/api/farms/demo/fields/nope", json={"name": "x"}).status_code == 404
    assert client.put("/api/farms/demo/fields/nope/soil", json=[]).status_code == 404
    assert client.post("/api/farms/demo/fields/nope/crop-history", json={"season_year": 2024, "crop_id": "oats"}).status_code == 404
    assert client.delete("/api/farms/demo/fields/north/crop-history/nope").status_code == 404


def test_invalid_bodies_are_422(client, db_session):
    seed_demo_farm(db_session)
    assert client.patch("/api/farms/demo/fields/north", json={"area_ha": -3}).status_code == 422
    assert client.post("/api/farms/demo/fields/north/crop-history", json={"season_year": 2024, "crop_id": "rice"}).status_code == 422
    assert client.patch("/api/farms/demo", json={"name": ""}).status_code == 422


def test_get_field_succeeds(client, db_session):
    seed_demo_farm(db_session)
    r = client.get("/api/farms/demo/fields/north")
    assert r.status_code == 200 and r.json()["name"] == "North Field"


def test_colour_map_unreachable_is_503(client, monkeypatch):
    colour_classes._cache.clear()

    def down(name):
        raise colour_classes.ColourMapUnavailable("Couldn't reach NASA GIBS for the colour key (ConnectError).")
    monkeypatch.setattr(colour_classes, "_fetch", down)
    r = client.get("/api/farms/nasa-colour", params={"colormap": "SMAP_Analyzed_Soil_Moisture", "r": 1, "g": 2, "b": 3})
    assert r.status_code == 503 and "NASA GIBS" in r.json()["detail"]


def test_saved_and_added_timestamps(client):
    """The UI shows "Farm details saved", "Field details saved" and "added" from these; they must move correctly."""
    farm = client.post("/api/farms", json={"name": "Dates"}).json()
    field = client.post(f"/api/farms/{farm['id']}/fields", json={"name": "A", "boundary": SQUARE}).json()
    for row in (farm, field):
        assert _ts(row["created_at"]) <= _ts(row["updated_at"])

    farm2 = client.patch(f"/api/farms/{farm['id']}", json={"constraints": "no irrigation"}).json()
    assert _ts(farm2["created_at"]) == _ts(farm["created_at"]) and _ts(farm2["updated_at"]) >= _ts(farm["updated_at"])
    field2 = client.patch(f"/api/farms/{farm['id']}/fields/{field['id']}", json={"name": "B"}).json()
    assert _ts(field2["created_at"]) == _ts(field["created_at"]) and _ts(field2["updated_at"]) >= _ts(field["updated_at"])


def test_soil_layers_carry_retrieved_at(client, db_session):
    seed_demo_farm(db_session)
    layers = client.get("/api/farms/demo/fields/north").json()["soil_layers"]
    assert all(l["retrieved_at"].startswith("2026-11-14") for l in layers)  # the day in the sample's _source
    r = client.put("/api/farms/demo/fields/north/soil", json=[{"depth_top_cm": 0, "depth_bottom_cm": 30, "clay_pct": 30,
                                                                "source": "Farmer-provided"}])
    assert r.json()["soil_layers"][0]["retrieved_at"]  # entered layers get the moment they were saved


def test_timestamps_always_carry_utc(client, db_session):
    """Created and re-read rows give the same zone-marked format (SQLite returns naive values on re-read)."""
    seed_demo_farm(db_session)
    farm = client.patch("/api/farms/demo", json={"constraints": "x"}).json()
    field = client.get("/api/farms/demo/fields/north").json()
    for value in (farm["created_at"], farm["updated_at"], field["created_at"], field["updated_at"],
                  field["soil_layers"][0]["retrieved_at"]):
        assert value.endswith("Z") or value.endswith("+00:00"), value
