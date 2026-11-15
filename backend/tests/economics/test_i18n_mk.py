"""The economics report and its errors read in Macedonian (the module's i18n_mk.py, registered in main.py)."""
import pytest

from tests.shared.test_i18n import ENGLISH, _prose

ECON = "/api/farms/demo/economics"
MK = {"Accept-Language": "mk"}
ROTS = [{"id": "B", "name": "Maize → Soybean", "crops": ["maize", "soybean"]},
        {"id": "A", "name": "Continuous maize", "crops": ["maize"]},
        {"id": "C", "name": "Maize → Soybean → Oats", "crops": ["maize", "soybean", "oats"], "cover_crop": True},
        {"id": "W", "name": "Winter wheat → Soybean", "crops": ["winter_wheat", "soybean"]}]


@pytest.mark.parametrize("body", [
    {"field_id": "north"},
    {"field_id": "north", "rotations": ROTS, "scenario": {"projection": "ssp245_2050s", "irrigation": "full"},
     "units": "us"},
    {"field_id": "north", "rotations": ROTS, "scenario": {"temp_delta_c": -1, "rain_change_pct": 10},
     "your_numbers": {"land": "own", "prices_usd_t": {"maize": 220}}},
])
def test_report_reads_in_macedonian(api, body):
    r = api.post(f"{ECON}/report", headers=MK, json=body)
    assert r.status_code == 200 and r.headers["content-language"] == "mk"
    english = [s for s in _prose(r.json()) if ENGLISH.search(s)]
    assert not english, english[:5]


def test_defaults_and_errors_read_in_macedonian(api):
    english = [s for s in _prose(api.get(f"{ECON}/defaults", headers=MK).json()) if ENGLISH.search(s)]
    assert not english, english[:5]
    r = api.post(f"{ECON}/report", headers=MK, json={"field_id": "north", "rotations": [ROTS[3], ROTS[0]]})
    assert r.status_code == 422 and not ENGLISH.search(r.json()["detail"]), r.json()["detail"]


def test_english_unchanged(api):
    r = api.post(f"{ECON}/report", json={"field_id": "north"})
    assert "content-language" not in r.headers
    assert r.json()["climate_bill"]["sentence"].startswith("In this scenario")
