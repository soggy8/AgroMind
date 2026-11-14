BASE = "/api/farms/demo/simulations"


def _request(client, **scenario):
    opts = client.get(f"{BASE}/options").json()
    return {"field_id": "north", "rotations": opts["suggested_rotations"],
            "scenario": {"years": 5, **scenario}, "include_economics": True}


def test_options(api):
    client = api
    r = client.get(f"{BASE}/options")
    assert r.status_code == 200
    body = r.json()
    assert {f["id"] for f in body["fields"]} == {"north", "creek", "west"}
    assert len(body["suggested_rotations"]) == 3
    assert "chickpea" not in {c["id"] for c in body["crops"]}


def test_run_today_has_no_change_vs_baseline(api):
    client = api
    body = client.post(f"{BASE}/run", json=_request(client)).json()
    assert body["kind"] == "modelled" and body["baseline_climate"]["kind"] == "observed"
    assert all(r["vs_baseline"]["relative_yield_change_pct"] == 0 for r in body["rotations"])
    assert [r["rank"] for r in body["rotations"]] == [1, 2, 3]
    assert body["ensemble_size"] == 25 and len(body["rotations"][0]["by_start_year"]) == 25


def test_hotter_drier_lowers_yield_and_rotation_beats_continuous_maize(api):
    client = api
    body = client.post(f"{BASE}/run", json=_request(client, temp_delta_c=2, rain_change_pct=-20)).json()
    by_id = {r["rotation_id"]: r for r in body["rotations"]}
    assert all(r["vs_baseline"]["relative_yield_change_pct"] < 0 for r in body["rotations"])
    assert body["scenario_climate"]["growing_season_rain_mm"] < body["baseline_climate"]["growing_season_rain_mm"]
    assert by_id["A"]["rank"] == 3  # continuous maize: rotation penalty and the lowest soil index
    assert by_id["A"]["economics"]["margin_per_ha"]["p50"] < by_id["B"]["economics"]["margin_per_ha"]["p50"]


def test_full_irrigation_uses_water_and_raises_yield(api):
    client = api
    rainfed = client.post(f"{BASE}/run", json=_request(client, temp_delta_c=2, rain_change_pct=-20)).json()
    irrigated = client.post(f"{BASE}/run", json=_request(client, temp_delta_c=2, rain_change_pct=-20, irrigation="full")).json()
    b_dry = next(r for r in rainfed["rotations"] if r["rotation_id"] == "B")
    b_irr = next(r for r in irrigated["rotations"] if r["rotation_id"] == "B")
    assert b_irr["irrigation_mm_per_year"]["p50"] > 0
    assert b_irr["relative_yield"]["p50"] >= b_dry["relative_yield"]["p50"]
    assert any(a["topic"] == "Irrigation" for a in irrigated["assumptions"])


def test_economics_left_out_for_crops_without_costs(api):
    client = api
    req = _request(client)
    req["rotations"] = [{"id": "W", "name": "Maize → Winter wheat", "crops": ["maize", "winter_wheat"]}]
    body = client.post(f"{BASE}/run", json=req).json()
    assert body["rotations"][0]["economics"] is None
    assert body["economics_included"] is False
    assert "no cost data" in body["data_note"]


def test_errors(api):
    client = api
    assert client.get("/api/farms/nope/simulations/options").status_code == 404
    bad = _request(client)
    bad["field_id"] = "nope"
    assert client.post(f"{BASE}/run", json=bad).status_code == 404
    bad = _request(client)
    bad["rotations"] = [{"id": "X", "name": "X", "crops": ["chickpea"]}]
    assert client.post(f"{BASE}/run", json=bad).status_code == 422
    bad = _request(client, temp_delta_c=10)
    assert client.post(f"{BASE}/run", json=bad).status_code == 422
    bad = _request(client, years=1)
    bad["rotations"] = [{"id": "W", "name": "W", "crops": ["winter_wheat"]}]
    assert client.post(f"{BASE}/run", json=bad).status_code == 422


def test_saved_runs_roundtrip(api):
    client = api
    req = _request(client, temp_delta_c=2, rain_change_pct=-20)
    saved = client.post(BASE, json={"name": "Hot and dry", "request": req})
    assert saved.status_code == 201
    run_id = saved.json()["id"]
    listed = client.get(BASE).json()
    assert [r["id"] for r in listed] == [run_id]
    assert client.get(f"{BASE}/{run_id}").json()["result"]["scenario"]["temp_delta_c"] == 2
    assert client.delete(f"{BASE}/{run_id}").status_code == 204
    assert client.get(f"{BASE}/{run_id}").status_code == 404
    assert client.get(f"{BASE}/..%2Fx").status_code == 404


def test_advisor_context_cites_result_numbers(api):
    client = api
    result = client.post(f"{BASE}/run", json=_request(client, temp_delta_c=2, rain_change_pct=-20)).json()
    ctx = client.post(f"{BASE}/advisor-context", json=result).json()
    assert "Use only the facts" in ctx["instructions"]
    top = result["rotations"][0]
    assert any(top["name"] in f and "rank 1" in f for f in ctx["facts"])
    assert ctx["suggested_questions"]


def _new_field(client, farm_id, **extra):
    ring = [[-93.4600, 42.0300], [-93.4560, 42.0300], [-93.4560, 42.0330], [-93.4600, 42.0330], [-93.4600, 42.0300]]
    body = {"name": "Test Field", "boundary": {"type": "Polygon", "coordinates": [ring]}, **extra}
    r = client.post(f"/api/farms/{farm_id}/fields", json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_field_from_croptwin_with_texture_only(api):
    client = api
    field_id = _new_field(client, "demo", soil_texture="sand", current_crop_id="soybean")
    opts = client.get(f"{BASE}/options").json()
    f = next(x for x in opts["fields"] if x["id"] == field_id)
    assert f["soil"] == "Sand" and f["crop_id"] == "soybean"
    req = _request(client)
    req["field_id"] = field_id
    sandy = client.post(f"{BASE}/run", json=req).json()
    assert sandy["soil"] == "Sand"
    req["field_id"] = "north"
    loamy = client.post(f"{BASE}/run", json=req).json()
    # Less water-holding soil: a smaller share of the crop's need is met without irrigation.
    assert sandy["rotations"][0]["rain_sufficiency"]["p50"] < loamy["rotations"][0]["rain_sufficiency"]["p50"]


def test_field_without_soil_data_uses_assumed_loam(api):
    client = api
    field_id = _new_field(client, "demo")
    f = next(x for x in client.get(f"{BASE}/options").json()["fields"] if x["id"] == field_id)
    assert f["soil"] == "Loam (assumed: no soil data)" and f["crop_id"] is None


def test_farm_without_fields(api):
    client = api
    farm = client.post("/api/farms", json={"name": "Empty farm"}).json()
    opts = client.get(f"/api/farms/{farm['id']}/simulations/options").json()
    assert opts["fields"] == [] and opts["farm"]["center"] is None


def test_saved_runs_are_scoped_to_their_farm(api):
    client = api
    run_id = client.post(BASE, json={"name": "Mine", "request": _request(client)}).json()["id"]
    other = client.post("/api/farms", json={"name": "Other farm"}).json()["id"]
    assert client.get(f"/api/farms/{other}/simulations/{run_id}").status_code == 404
    assert client.get(f"/api/farms/{other}/simulations").json() == []


def test_published_heat_response_matches_target_and_exceeds_local(api):
    client = api
    req = _request(client, temp_delta_c=1)
    req["rotations"] = [{"id": "A", "name": "Continuous maize", "crops": ["maize"]}]
    req["field_id"] = "creek"  # current crop soybean: no rotation penalty in season 1
    pub = client.post(f"{BASE}/run", json={**req, "scenario": {**req["scenario"], "heat_response": "published"}}).json()
    loc = client.post(f"{BASE}/run", json={**req, "scenario": {**req["scenario"], "heat_response": "local"}}).json()
    p, l = pub["rotations"][0]["vs_baseline"], loc["rotations"][0]["vs_baseline"]
    assert -12.5 < p["relative_yield_change_pct"] < -8.5     # Zhao et al. 2017: USA maize -10.3% per C
    assert l["relative_yield_change_pct"] > p["relative_yield_change_pct"]
    assert p["other_heat_response_change_pct"] == l["relative_yield_change_pct"]
    assert any(a["topic"] == "Response to warming" and "Zhao" in a["source"] for a in pub["assumptions"])


def test_heat_response_does_not_change_todays_climate(api):
    client = api
    a = client.post(f"{BASE}/run", json=_request(client, heat_response="published")).json()
    b = client.post(f"{BASE}/run", json=_request(client, heat_response="local")).json()
    assert [r["relative_yield"] for r in a["rotations"]] == [r["relative_yield"] for r in b["rotations"]]


def test_cooler_scenario_gets_no_warming_penalty(api):
    client = api
    body = client.post(f"{BASE}/run", json=_request(client, temp_delta_c=-1)).json()
    for r in body["rotations"]:
        assert r["vs_baseline"]["relative_yield_change_pct"] == r["vs_baseline"]["other_heat_response_change_pct"]


def test_advisor_facts_describe_a_projection(api):
    client = api
    req = _request(client, projection="ssp245_2050s")
    result = client.post(f"{BASE}/run", json=req).json()
    facts = client.post(f"{BASE}/advisor-context", json=result).json()["facts"]
    scenario = next(f for f in facts if f.startswith("SCENARIO:"))
    assert "NEX-GDDP-CMIP6" in scenario and "Response to heat" in scenario
