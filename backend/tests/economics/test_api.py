import time

ECON, SIM = "/api/farms/demo/economics", "/api/farms/demo/simulations"
ROTS = [{"id": "B", "name": "Maize → Soybean", "crops": ["maize", "soybean"]},
        {"id": "A", "name": "Continuous maize", "crops": ["maize"]},
        {"id": "C", "name": "Maize → Soybean → Oats", "crops": ["maize", "soybean", "oats"], "cover_crop": True}]
SC = {"temp_delta_c": 2, "rain_change_pct": -20, "years": 5}


def test_defaults(api):
    body = api.get(f"{ECON}/defaults").json()
    assert body["default_yours_rotation_id"] == "B"
    assert {i["id"] for i in body["inputs"]} >= {"price.maize", "cost.maize", "rent", "irrigation", "cover_crop"}


def test_report_matches_simulator_margins(api):
    sim = api.post(f"{SIM}/run", json={"field_id": "north", "rotations": ROTS, "scenario": SC,
                                       "include_economics": True}).json()
    t0 = time.perf_counter()
    rep = api.post(f"{ECON}/report", json={"field_id": "north", "rotations": ROTS, "scenario": SC}).json()
    print(f"economics report: {time.perf_counter() - t0:.2f} s")
    by_id = {b["rotation_id"]: b["annual_margin"] for b in rep["bad_years"]}
    for r in sim["rotations"]:
        for q in ("p10", "p50", "p90"):
            assert abs(by_id[r["rotation_id"]][q] - r["economics"]["margin_per_ha"][q]) <= 3
    assert rep["climate_bill"]["kind"] == "modelled" and rep["area"]["kind"] == "observed"
    assert rep["who_earns_most"]["cells"] and len(rep["who_earns_most"]["cells"]) == 5
    assert time.perf_counter() - t0 <= 7  # Kiril: 7 s max


def test_errors(api):
    assert api.post("/api/farms/nope/economics/report", json={"field_id": "north"}).status_code == 404
    wheat = [{"id": "W", "name": "Wheat", "crops": ["winter_wheat"]}]
    assert api.post(f"{ECON}/report", json={"field_id": "north", "rotations": wheat}).status_code == 422
    banana = api.post(f"{ECON}/report", json={"field_id": "north", "rotations": ROTS[:1] + [
        {"id": "Z", "name": "Banana", "crops": ["banana"]}]})
    assert banana.status_code == 422
    assert banana.json()["detail"] == "Banana includes 'banana', which isn't a known crop."
