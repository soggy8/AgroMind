"""CropTwin's fact list for the AI advisor."""
from app.modules.croptwin.seed import seed_demo_farm


def test_demo_farm_facts(client, db_session):
    seed_demo_farm(db_session)
    ctx = client.get("/api/farms/demo/advisor-context").json()
    facts = "\n".join(ctx["facts"])
    assert ctx["facts"][0].startswith("Farm: Demo Farm, Story County, Iowa.")
    assert "North Field: 39.1 ha (MODELLED, computed from the drawn boundary)" in facts
    assert "0-5 cm MODELLED: sand 32%" in facts and "SoilGrids" in facts
    assert "North Field has no crop history recorded." in facts
    assert "What is missing from the profile?" in ctx["suggested_questions"]


def test_unknown_farm_is_404(client):
    assert client.get("/api/farms/nope/advisor-context").status_code == 404
