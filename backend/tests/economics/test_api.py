"""Real Simulator on the seeded demo farm."""
import time

ECON, SIM = "/api/farms/demo/economics", "/api/farms/demo/simulations"
ROTS = [{"id": "B", "name": "Maize → Soybean", "crops": ["maize", "soybean"]},
        {"id": "A", "name": "Continuous maize", "crops": ["maize"]},
        {"id": "C", "name": "Maize → Soybean → Oats", "crops": ["maize", "soybean", "oats"], "cover_crop": True}]
SC = {"temp_delta_c": 2, "rain_change_pct": -20, "years": 5}


def test_defaults(api):
    r = api.get(f"{ECON}/defaults")
    assert r.status_code == 200
    body = r.json()
    assert body["default_yours_rotation_id"] == "B"
    assert {i["id"] for i in body["inputs"]} >= {"price.maize", "cost.maize", "rent", "irrigation", "cover_crop"}


def _check_against_simulator(api, rots):
    sim = api.post(f"{SIM}/run", json={"field_id": "north", "rotations": rots, "scenario": SC,
                                       "include_economics": True}).json()
    rep = api.post(f"{ECON}/report", json={"field_id": "north", "rotations": rots, "scenario": SC})
    assert rep.status_code == 200, rep.text
    by_id = {b["rotation_id"]: b["annual_margin"] for b in rep.json()["bad_years"]}
    for r in sim["rotations"]:
        for q in ("p10", "p50", "p90"):
            assert abs(by_id[r["rotation_id"]][q] - r["economics"]["margin_per_ha"][q]) <= 3, (r["rotation_id"], q)
    return rep.json()


def test_report_matches_simulator_margins_and_is_fast(api):
    _check_against_simulator(api, ROTS)  # also warms the Simulator up
    t0 = time.perf_counter()
    rep = api.post(f"{ECON}/report", json={"field_id": "north", "rotations": ROTS,
                                           "scenario": SC | {"temp_delta_c": 2.5}}).json()
    took = time.perf_counter() - t0
    print(f"economics report: {took:.2f} s")
    assert rep["climate_bill"]["kind"] == "modelled" and rep["area"]["kind"] == "observed"
    assert len(rep["who_earns_most"]["cells"]) == 5
    assert took <= 7  # Kiril, 2026-11-15: 7 s max


def test_report_matches_simulator_without_cover_crops(api):
    _check_against_simulator(api, [dict(r, cover_crop=False) for r in ROTS])


def test_default_report(api):
    r = api.post(f"{ECON}/report", json={"field_id": "north"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["yours_assumed"] and body["yours_rotation_id"] == "B"


def test_errors(api):
    assert api.post("/api/farms/nope/economics/report", json={"field_id": "north"}).status_code == 404
    assert api.post(f"{ECON}/report", json={"field_id": "nope"}).status_code == 404
    wheat = [{"id": "W", "name": "Wheat", "crops": ["winter_wheat"]}]
    r = api.post(f"{ECON}/report", json={"field_id": "north", "rotations": wheat})
    assert r.status_code == 422 and "no Iowa price" in r.json()["detail"]
