"""Rotation finder, irrigation planner, cover crops and replay data."""
from app.modules.simulator.service import candidate_rotations

BASE = "/api/farms/demo/simulations"
HOT_DRY = {"temp_delta_c": 2, "rain_change_pct": -20, "years": 5}


def test_candidates_are_distinct_cycles_without_self_repeats():
    cands = candidate_rotations(["maize", "soybean", "oats"], 3)
    assert ["maize"] in cands and ["maize", "soybean"] in cands
    assert ["soybean", "maize"] not in cands  # same cycle as maize-soybean
    assert all(len(c) == 1 or all(a != b for a, b in zip(c, c[1:] + c[:1])) for c in cands)
    assert len(cands) == len({tuple(c) for c in cands}) == 8


def test_finder_ranks_and_respects_economics(api):
    body = api.post(f"{BASE}/find", json={"field_id": "north", "scenario": HOT_DRY, "include_economics": True,
                                           "priorities": {"yield": 1, "water": 1, "risk": 1, "soil": 1, "margin": 1}}).json()
    assert body["candidates_tested"] == 8  # maize, soybean, oats: the crops with Iowa prices and costs
    names = [r["name"] for r in body["rotations"]]
    assert len(names) == 5 and "Continuous maize" not in names[:2]
    assert [r["rank"] for r in body["rotations"]] == [1, 2, 3, 4, 5]
    assert all(r["economics"] is not None for r in body["rotations"])


def test_irrigation_plan_is_monotonic_and_explains_heat_limit(api):
    plan = api.post(f"{BASE}/irrigation-plan", json={
        "field_id": "north", "scenario": HOT_DRY,
        "rotation": {"id": "B", "name": "Maize → Soybean", "crops": ["maize", "soybean"]}}).json()
    yields = [p["relative_yield"]["p50"] for p in plan["points"]]
    water = [p["irrigation_mm_per_year"] for p in plan["points"]]
    assert yields == sorted(yields) and water == sorted(water) and water[0] == 0
    assert plan["points"][-1]["cap_mm"] is None
    if not plan["reaches_target"]:
        assert "heat, not water" in plan["summary"]


def test_irrigation_plan_reaches_a_low_target(api):
    plan = api.post(f"{BASE}/irrigation-plan", json={
        "field_id": "north", "scenario": {"temp_delta_c": 1, "rain_change_pct": -30, "heat_response": "local"},
        "target_share": 0.9, "rotation": {"id": "B", "name": "Maize → Soybean", "crops": ["maize", "soybean"]}}).json()
    assert plan["reaches_target"] and plan["recommended_cap_mm"] is not None


def test_cover_crop_raises_soil_index_and_costs_money(api):
    rots = [{"id": "A", "name": "M-S rye", "crops": ["maize", "soybean"], "cover_crop": True},
            {"id": "B", "name": "M-S", "crops": ["maize", "soybean"]}]
    body = api.post(f"{BASE}/run", json={"field_id": "north", "rotations": rots, "include_economics": True}).json()
    rye, plain = (next(r for r in body["rotations"] if r["rotation_id"] == i) for i in ("A", "B"))
    assert rye["cover_crop"] and rye["soil"]["score"] == plain["soil"]["score"] + 15
    assert rye["economics"]["margin_per_ha"]["p50"] < plain["economics"]["margin_per_ha"]["p50"]
    assert any(a["topic"] == "Cover crop" for a in body["assumptions"])


def test_replay_data_covers_every_weather_year(api):
    body = api.post(f"{BASE}/run", json={"field_id": "north", "scenario": HOT_DRY, "rotations": [
        {"id": "B", "name": "Maize → Soybean", "crops": ["maize", "soybean"]}]}).json()
    rot = body["rotations"][0]
    assert len(rot["track_seasons"]) == body["ensemble_size"] == len(body["yearly_climate"])
    assert all(len(t) == len(rot["seasons"]) for t in rot["track_seasons"])
    y2012 = next(y for y in body["yearly_climate"] if y["year"] == 2012)
    assert y2012["scenario_rain_mm"] < y2012["rain_mm"] and y2012["scenario_tmax_c"] > y2012["tmax_c"]


def test_projection_options_and_run(api):
    opts = api.get(f"{BASE}/options").json()
    ids = {p["id"] for p in opts["projections"]}
    assert {"ssp245_2050s", "ssp585_2080s"} <= ids
    hot = next(p for p in opts["projections"] if p["id"] == "ssp585_2080s")
    mid = next(p for p in opts["projections"] if p["id"] == "ssp245_2050s")
    assert hot["temp_change_c"]["median"] > mid["temp_change_c"]["median"] > 0
    assert hot["temp_change_c"]["min"] <= hot["temp_change_c"]["median"] <= hot["temp_change_c"]["max"]

    body = api.post(f"{BASE}/run", json={"field_id": "north", "scenario": {"projection": "ssp585_2080s"},
                                          "rotations": opts["suggested_rotations"]}).json()
    assert body["projection"]["id"] == "ssp585_2080s"
    assert body["scenario_climate"]["growing_season_tmax_c"] > body["baseline_climate"]["growing_season_tmax_c"] + 3
    assert all(r["vs_baseline"]["relative_yield_change_pct"] < -10 for r in body["rotations"])
    assert any(a["topic"] == "Climate projection" for a in body["assumptions"])
    assert "NEX-GDDP-CMIP6" in body["data_note"]


def test_unknown_projection_is_rejected(api):
    r = api.post(f"{BASE}/run", json={"field_id": "north", "scenario": {"projection": "ssp126_2050s"},
                                       "rotations": [{"id": "A", "name": "M", "crops": ["maize"]}]})
    assert r.status_code == 422
