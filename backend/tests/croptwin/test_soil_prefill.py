"""Soil prefill from SoilGrids (the committed sample; no network) and how the Simulator reads the result."""
import json
from datetime import datetime, timezone

import pytest

from app.modules.croptwin import geometry, soil_source
from app.modules.croptwin.seed import seed_demo_farm
from app.modules.simulator import ports

SAMPLE = json.loads(soil_source.SAMPLE.read_text(encoding="utf-8"))

# About 330 m x 330 m at the sample point (42.03 N, 93.46 W), clear of the seeded demo fields.
NEAR = {"type": "Polygon", "coordinates": [[[-93.462, 42.030], [-93.458, 42.030], [-93.458, 42.033],
                                            [-93.462, 42.033], [-93.462, 42.030]]]}
# Same shape in Nebraska, about 400 km west.
FAR = {"type": "Polygon", "coordinates": [[[x - 4.8, y] for x, y in NEAR["coordinates"][0]]]}


def test_adapter_reads_every_layer_with_its_citation():
    profile = soil_source.soilgrids_profile(42.035, -93.46)
    assert [(l.depth_top_cm, l.depth_bottom_cm) for l in profile.layers] == [(0, 5), (30, 60), (60, 100)]
    for layer, raw in zip(profile.layers, SAMPLE["layers"]):
        assert (layer.sand_pct, layer.silt_pct, layer.clay_pct, layer.soc_g_kg, layer.ph) == \
               (raw["sand_pct"], raw["silt_pct"], raw["clay_pct"], raw["soc_g_kg"], raw["ph"])
        assert layer.source == SAMPLE["_source"]
    assert profile.retrieved_at == datetime(2026, 11, 14, tzinfo=timezone.utc)


def test_adapter_refuses_locations_the_sample_does_not_cover():
    with pytest.raises(soil_source.SoilDataUnavailable, match="lab report"):
        soil_source.soilgrids_profile(41.0, -98.0)


def _field(client, boundary, **extra):
    farm_id = client.post("/api/farms", json={"name": "F"}).json()["id"]
    r = client.post(f"/api/farms/{farm_id}/fields", json={"name": "New", "boundary": boundary, **extra})
    assert r.status_code == 201, r.text
    return farm_id, r.json()["id"]


def test_prefill_route_replaces_layers(client):
    farm_id, field_id = _field(client, NEAR)
    base = f"/api/farms/{farm_id}/fields/{field_id}"
    client.put(f"{base}/soil", json=[{"depth_top_cm": 0, "depth_bottom_cm": 30, "clay_pct": 20,
                                      "source": "Farmer-provided"}])
    r = client.post(f"{base}/soil/prefill")
    assert r.status_code == 200, r.text
    layers = r.json()["soil_layers"]
    assert len(layers) == 3 and all(l["source"] == SAMPLE["_source"] for l in layers)
    assert layers[0]["retrieved_at"].startswith("2026-11-14")


def test_prefill_route_errors(client):
    farm_id, _ = _field(client, NEAR)
    assert client.post(f"/api/farms/{farm_id}/fields/nope/soil/prefill").status_code == 404
    far_farm, far_field = _field(client, FAR)
    r = client.post(f"/api/farms/{far_farm}/fields/{far_field}/soil/prefill")
    assert r.status_code == 503 and "lab report" in r.json()["detail"]


def test_crossing_boundary_and_unknown_crop_rejected(client):
    bowtie = {"type": "Polygon", "coordinates": [[[-93.46, 42.03], [-93.45, 42.04], [-93.45, 42.03],
                                                  [-93.46, 42.04], [-93.46, 42.03]]]}
    with pytest.raises(geometry.InvalidBoundary, match="cross"):
        geometry.area_ha(bowtie)
    farm_id = client.post("/api/farms", json={"name": "F"}).json()["id"]
    assert client.post(f"/api/farms/{farm_id}/fields", json={"name": "x", "boundary": bowtie}).status_code == 422
    assert client.post(f"/api/farms/{farm_id}/fields",
                       json={"name": "x", "boundary": NEAR, "current_crop_id": "rice"}).status_code == 422


def test_field_round_trips_through_simulator_ports(client, db_session):
    """A field drawn and prefilled through CropTwin's API is what the Simulator reads (ports used read-only)."""
    seed_demo_farm(db_session)
    r = client.post("/api/farms/demo/fields", json={"name": "Drawn Field", "boundary": NEAR,
                                                    "current_crop_id": "soybean", "irrigation_available": True})
    field = r.json()
    client.post(f"/api/farms/demo/fields/{field['id']}/soil/prefill")

    snap = ports.load_field(db_session, "demo", field["id"])
    assert (snap.name, snap.previous_crop_id, snap.irrigation_available) == ("Drawn Field", "soybean", True)
    assert snap.area_ha == pytest.approx(field["area_ha"])
    assert (snap.latitude, snap.longitude) == pytest.approx((42.0315, -93.46))
    assert snap.soil.description.endswith("(SoilGrids)")

    view = next(f for f in ports.get_farm(db_session, "demo").fields if f.id == field["id"])
    assert view.boundary == tuple((lat, lon) for lon, lat in NEAR["coordinates"][0][:-1])
    assert view.crop_id == "soybean" and view.area_ha == round(field["area_ha"], 1)
