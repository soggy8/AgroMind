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
    assert GridSpec(warming_c=[-1, 0, 2, 4, 5]).warming_c == [-1, 0, 2, 4, 5]  # at most 5 rows
    for bad in ([1], [0, 0], [0, 6], [-1, 0, 1, 2, 3, 4]):
        with pytest.raises(ValidationError):
            GridSpec(warming_c=bad)
    with pytest.raises(ValidationError):
        GridSpec(price_change_pct=[0, 50])

def test_limited_irrigation_needs_cap_and_prices_positive():
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", scenario={"irrigation": "limited"})
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", your_numbers={"prices_usd_t": {"maize": 0}})

def test_your_numbers_have_upper_bounds():
    top = {"prices_usd_t": {"maize": 10_000}, "costs_before_rent_usd_ha": {"maize": 20_000}, "rent_usd_ha": 20_000,
           "irrigation_usd_per_mm_ha": 100, "cover_crop_usd_ha": 5_000}
    assert EconomicsRequest(field_id="north", your_numbers=top).your_numbers.rent_usd_ha == 20_000
    for key, bad in [("prices_usd_t", {"maize": 10_001}), ("costs_before_rent_usd_ha", {"soybean": 20_001}),
                     ("rent_usd_ha", 20_001), ("irrigation_usd_per_mm_ha", 101), ("cover_crop_usd_ha", 5_001),
                     ("prices_usd_t", {"maize": 1e308}), ("costs_before_rent_usd_ha", {"maize": float("inf")})]:
        with pytest.raises(ValidationError):
            EconomicsRequest(field_id="north", your_numbers={key: bad})
