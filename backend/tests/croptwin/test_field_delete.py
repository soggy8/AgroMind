"""Deleting a field removes its soil layers and crop history, and the Simulator stops listing it."""
from sqlalchemy import func, select

from app.modules.croptwin.models import CropHistory, SoilLayer
from app.modules.croptwin.seed import seed_demo_farm
from tests.ownership import claim
from app.modules.simulator import ports

NEAR = {"type": "Polygon", "coordinates": [[[-93.462, 42.030], [-93.458, 42.030], [-93.458, 42.033],
                                            [-93.462, 42.033], [-93.462, 42.030]]]}


def test_delete_field_removes_its_soil_and_history(client, db_session):
    seed_demo_farm(db_session)
    claim(db_session)
    field_id = client.post("/api/farms/demo/fields", json={"name": "Temp", "boundary": NEAR}).json()["id"]
    base = f"/api/farms/demo/fields/{field_id}"
    client.post(f"{base}/soil/prefill")
    client.post(f"{base}/crop-history", json={"season_year": 2025, "crop_id": "oats"})

    assert client.delete(base).status_code == 204
    assert client.get(base).status_code == 404
    assert [f.id for f in ports.get_farm(db_session, "demo").fields] == ["north", "creek", "west"]
    count = lambda model: db_session.scalar(select(func.count()).select_from(model).where(model.field_id == field_id))
    assert count(SoilLayer) == 0 and count(CropHistory) == 0


def test_delete_unknown_field_is_404(client, db_session):
    seed_demo_farm(db_session)
    claim(db_session)
    r = client.delete("/api/farms/demo/fields/nope")
    assert r.status_code == 404 and "nope" in r.json()["detail"]
    assert client.delete("/api/farms/nofarm/fields/north").status_code == 404
