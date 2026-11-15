"""Prices, costs and yields for the economics module. Data only, no logic.

Values and source wording are copied from the Simulator's parameters (this module may not import
them). Confidence levels in `sources`: ISU, WASDE (see below) and ASSUME, a judgement value that
is listed in every report's assumptions so the user sees it.

  ISU    - Iowa State University Ag Decision Maker File A1-20, "Estimated Costs of Crop
           Production in Iowa - 2026" (mid-yield budgets)
  WASDE  - USDA World Agricultural Supply and Demand Estimates, November 2026

Region: central Iowa (demo farm, Story County). Costs are stored per hectare.
"""
from __future__ import annotations

from dataclasses import dataclass

ACRES_PER_HA = 2.4710538


def per_acre_to_per_ha(usd_per_acre: float) -> float:
    return usd_per_acre * ACRES_PER_HA


def bu_ac_to_t_ha(bu_per_acre: float, lb_per_bu: float) -> float:
    return bu_per_acre * lb_per_bu * 0.45359237 / 1000 * ACRES_PER_HA


def usd_per_bu_to_usd_per_t(usd_per_bu: float, lb_per_bu: float) -> float:
    return usd_per_bu / (lb_per_bu * 0.45359237 / 1000)


@dataclass(frozen=True)
class CropMoney:
    crop_id: str
    name: str
    price_usd_t: float
    typical_yield_t_ha: float
    cost_before_rent_usd_ha: float
    cost_after_self_before_rent_usd_ha: float | None
    sources: dict[str, str]   # keys: price, yield, cost
    display: dict[str, str]   # keys: price, yield, cost, in the units a farmer reads


CORN_LB, SOY_LB, OAT_LB = 56.0, 60.0, 32.0

_WASDE = "WASDE: Nov 2026, 2026/27 projected season-average farm price"
_ISU_COST = "ISU: A1-20 (2026) total cost per acre, mid-yield budget, incl. $274/ac cash rent and labour"

RENT_USD_AC = 274.0
RENT_USD_HA = per_acre_to_per_ha(RENT_USD_AC)
RENT_SOURCE = "ISU: A1-20 (2026) cash rent, $274/ac"
RENT_DISPLAY = "$274/ac"

CROP_MONEY: dict[str, CropMoney] = {c.crop_id: c for c in [
    CropMoney(
        crop_id="maize", name="Maize",
        price_usd_t=usd_per_bu_to_usd_per_t(4.60, CORN_LB),
        typical_yield_t_ha=bu_ac_to_t_ha(211, CORN_LB),
        cost_before_rent_usd_ha=per_acre_to_per_ha(911.98 - RENT_USD_AC),
        cost_after_self_before_rent_usd_ha=per_acre_to_per_ha(960.02 - RENT_USD_AC),
        sources={
            "price": f"{_WASDE} ($4.60/bu)",
            "yield": "ISU: A1-20 (2026) corn after soybeans, mid budget, 211 bu/ac",
            "cost": f"{_ISU_COST}: corn after soybeans $911.98, corn after corn $960.02; rent taken out",
        },
        display={"price": "$4.60/bu", "yield": "211 bu/ac", "cost": "$637.98/ac"},
    ),
    CropMoney(
        crop_id="soybean", name="Soybean",
        price_usd_t=usd_per_bu_to_usd_per_t(12.10, SOY_LB),
        typical_yield_t_ha=bu_ac_to_t_ha(61, SOY_LB),
        cost_before_rent_usd_ha=per_acre_to_per_ha(679.11 - RENT_USD_AC),
        cost_after_self_before_rent_usd_ha=None,
        sources={
            "price": f"{_WASDE} ($12.10/bu)",
            "yield": "ISU: A1-20 (2026) soybeans after corn, mid budget, 61 bu/ac",
            "cost": f"{_ISU_COST}: soybeans after corn $679.11; rent taken out",
        },
        display={"price": "$12.10/bu", "yield": "61 bu/ac", "cost": "$405.11/ac"},
    ),
    CropMoney(
        crop_id="oats", name="Oats",
        price_usd_t=usd_per_bu_to_usd_per_t(3.35, OAT_LB),
        typical_yield_t_ha=bu_ac_to_t_ha(80, OAT_LB),
        cost_before_rent_usd_ha=per_acre_to_per_ha(465.0 - RENT_USD_AC),
        cost_after_self_before_rent_usd_ha=None,
        sources={
            "price": f"{_WASDE} ($3.35/bu)",
            "yield": "ISU: A1-20 (2026) oat yield assumed in the oat-companion budget, 80 bu/ac",
            "cost": "ASSUME: $465/ac = ISU 2026 cash rent $274 + about $190 seed, fertiliser, machinery and labour. "
                    "ISU publishes no grain-oat budget; replace with a farm or Practical Farmers of Iowa budget.",
        },
        display={"price": "$3.35/bu", "yield": "80 bu/ac", "cost": "$191/ac"},
    ),
]}

# Total ISU cost per acre including rent. Used by the tests to check the per-hectare costs above.
ISU_TOTAL_COST_USD_AC = {"maize": 911.98, "maize_after_maize": 960.02, "soybean": 679.11, "oats": 465.0}

IRRIGATION_USD_PER_MM_HA = 0.50
IRRIGATION_SOURCE = ("ASSUME: $0.50 per mm per ha (about $5 per acre-inch) pumping and energy only; "
                     "equipment ownership is not included. Iowa grain is rarely irrigated.")

COVER_CROP_USD_HA = per_acre_to_per_ha(35.0)
COVER_CROP_SOURCE = "ASSUME: $35/ac seed and seeding (an Iowa farm reports $26.71/ac after herbicide savings)"

NEAR_TIE_USD_HA = 45.0
NEAR_TIE_SOURCE = "ASSUME: the Simulator's 0.03 near-tie on its $1,500/ha margin scale"

DEFAULT_YOURS_CROPS = ("maize", "soybean")
DEFAULT_YOURS_SOURCE = "ASSUME: maize-soybean is the usual central-Iowa rotation"

DEFAULT_WARMING_C = (0.0, 1.0, 2.0, 3.0, 4.0)
DEFAULT_PRICE_STEPS_PCT = (-30.0, -15.0, 0.0, 15.0, 30.0)
