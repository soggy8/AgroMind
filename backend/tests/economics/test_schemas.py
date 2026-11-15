import pytest
from pydantic import ValidationError
from app.modules.economics.schemas import EconomicsRequest, GridSpec

def test_defaults():
    r = EconomicsRequest(field_id="north")
    assert r.rotations is None and r.units == "metric" and r.your_numbers.land == "rent"
    assert r.grid.warming_c == [0, 1, 2, 3, 4] and r.grid.price_change_pct == [-30, -15, 0, 15, 30]

def test_duplicate_rotation_ids_rejected():
    rot = {"id": "A", "name": "x", "crops": ["maize"]}
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", rotations=[rot, rot])

def test_grid_sorted_and_limited():
    assert GridSpec(warming_c=[2, 0, 1]).warming_c == [0, 1, 2]
    for bad in ([1], [0, 0], [0, 6], list(range(8))):
        with pytest.raises(ValidationError):
            GridSpec(warming_c=bad)
    with pytest.raises(ValidationError):
        GridSpec(price_change_pct=[0, 50])

def test_limited_irrigation_needs_cap_and_prices_positive():
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", scenario={"irrigation": "limited"})
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", your_numbers={"prices_usd_t": {"maize": 0}})
