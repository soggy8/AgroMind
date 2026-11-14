import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
BASE = "/api/farms/demo/simulations"


def _request(**scenario):
    opts = client.get(f"{BASE}/options").json()
    return {"field_id": "north", "rotations": opts["suggested_rotations"],
            "scenario": {"years": 5, **scenario}, "include_economics": True}


def test_options():
    r = client.get(f"{BASE}/options")
    assert r.status_code == 200
    body = r.json()
    assert {f["id"] for f in body["fields"]} == {"north", "creek", "west"}
    assert len(body["suggested_rotations"]) == 3
    assert "chickpea" not in {c["id"] for c in body["crops"]}


def test_run_today_has_no_change_vs_baseline():
    body = client.post(f"{BASE}/run", json=_request()).json()
    assert body["kind"] == "modelled" and body["baseline_climate"]["kind"] == "observed"
    assert all(r["vs_baseline"]["relative_yield_change_pct"] == 0 for r in body["rotations"])
    assert [r["rank"] for r in body["rotations"]] == [1, 2, 3]
    assert body["ensemble_size"] == 25 and len(body["rotations"][0]["by_start_year"]) == 25


def test_hotter_drier_lowers_yield_and_rotation_beats_continuous_maize():
    body = client.post(f"{BASE}/run", json=_request(temp_delta_c=2, rain_change_pct=-20)).json()
    by_id = {r["rotation_id"]: r for r in body["rotations"]}
    assert all(r["vs_baseline"]["relative_yield_change_pct"] < 0 for r in body["rotations"])
    assert body["scenario_climate"]["growing_season_rain_mm"] < body["baseline_climate"]["growing_season_rain_mm"]
    assert by_id["A"]["rank"] == 3  # continuous maize: rotation penalty and the lowest soil index
    assert by_id["A"]["economics"]["margin_per_ha"]["p50"] < by_id["B"]["economics"]["margin_per_ha"]["p50"]


def test_full_irrigation_uses_water_and_raises_yield():
    rainfed = client.post(f"{BASE}/run", json=_request(temp_delta_c=2, rain_change_pct=-20)).json()
    irrigated = client.post(f"{BASE}/run", json=_request(temp_delta_c=2, rain_change_pct=-20, irrigation="full")).json()
    b_dry = next(r for r in rainfed["rotations"] if r["rotation_id"] == "B")
    b_irr = next(r for r in irrigated["rotations"] if r["rotation_id"] == "B")
    assert b_irr["irrigation_mm_per_year"]["p50"] > 0
    assert b_irr["relative_yield"]["p50"] >= b_dry["relative_yield"]["p50"]
    assert any(a["topic"] == "Irrigation" for a in irrigated["assumptions"])


def test_economics_left_out_for_crops_without_costs():
    req = _request()
    req["rotations"] = [{"id": "W", "name": "Maize → Winter wheat", "crops": ["maize", "winter_wheat"]}]
    body = client.post(f"{BASE}/run", json=req).json()
    assert body["rotations"][0]["economics"] is None
    assert body["economics_included"] is False
    assert "no cost data" in body["data_note"]


def test_errors():
    assert client.get("/api/farms/nope/simulations/options").status_code == 404
    bad = _request()
    bad["field_id"] = "nope"
    assert client.post(f"{BASE}/run", json=bad).status_code == 404
    bad = _request()
    bad["rotations"] = [{"id": "X", "name": "X", "crops": ["chickpea"]}]
    assert client.post(f"{BASE}/run", json=bad).status_code == 422
    bad = _request(temp_delta_c=10)
    assert client.post(f"{BASE}/run", json=bad).status_code == 422
    bad = _request(years=1)
    bad["rotations"] = [{"id": "W", "name": "W", "crops": ["winter_wheat"]}]
    assert client.post(f"{BASE}/run", json=bad).status_code == 422


def test_saved_runs_roundtrip():
    req = _request(temp_delta_c=2, rain_change_pct=-20)
    saved = client.post(BASE, json={"name": "Hot and dry", "request": req})
    assert saved.status_code == 201
    run_id = saved.json()["id"]
    listed = client.get(BASE).json()
    assert [r["id"] for r in listed] == [run_id]
    assert client.get(f"{BASE}/{run_id}").json()["result"]["scenario"]["temp_delta_c"] == 2
    assert client.delete(f"{BASE}/{run_id}").status_code == 204
    assert client.get(f"{BASE}/{run_id}").status_code == 404
    assert client.get(f"{BASE}/..%2Fx").status_code == 404


def test_advisor_context_cites_result_numbers():
    result = client.post(f"{BASE}/run", json=_request(temp_delta_c=2, rain_change_pct=-20)).json()
    ctx = client.post(f"{BASE}/advisor-context", json=result).json()
    assert "Use only the facts" in ctx["instructions"]
    top = result["rotations"][0]
    assert any(top["name"] in f and "rank 1" in f for f in ctx["facts"])
    assert ctx["suggested_questions"]
