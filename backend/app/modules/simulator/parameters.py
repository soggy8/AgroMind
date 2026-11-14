"""Crop, soil and economic parameters for the simulator. Data only, no logic.

Every value carries where it came from. Confidence levels used in `sources`:
  FAO    - read from FAO-56 (Allen et al. 1998), table named in the source
  ISU    - Iowa State University Ag Decision Maker File A1-20, "Estimated Costs of Crop
           Production in Iowa - 2026" (mid-yield budgets)
  WASDE  - USDA World Agricultural Supply and Demand Estimates, November 2026 (2026/27 projected
           season-average farm price)
  CALIB  - fitted against USDA NASS Story County yields, see docs/modules/simulator_calibration.md
  PROXY  - value for a similar crop, used because the crop has no own row
  ASSUME - a judgement value. Listed in every result's assumptions so the user sees it.

Region: calendars and economics are for central Iowa (demo farm, Story County, ~42 N).
"""
from __future__ import annotations

from dataclasses import dataclass, field

ACRES_PER_HA = 2.4710538


def bu_ac_to_t_ha(bu_per_acre: float, lb_per_bu: float) -> float:
    return bu_per_acre * lb_per_bu * 0.45359237 / 1000 * ACRES_PER_HA


def per_acre_to_per_ha(usd_per_acre: float) -> float:
    return usd_per_acre * ACRES_PER_HA


def usd_per_bu_to_usd_per_t(usd_per_bu: float, lb_per_bu: float) -> float:
    return usd_per_bu / (lb_per_bu * 0.45359237 / 1000)


@dataclass(frozen=True)
class CropEconomics:
    price_usd_t: float                 # farm price
    cost_usd_ha: float                 # total cost incl. land rent and labour
    cost_after_self_usd_ha: float | None  # when the crop follows itself (ISU has corn-after-corn)
    sources: dict[str, str]


@dataclass(frozen=True)
class CropParams:
    id: str
    name: str
    family: str                        # cereal | legume | oilseed
    plant_doy: int                     # typical planting day of year
    stages: tuple[int, int, int, int]  # initial, development, mid, late (days)
    kc: tuple[float, float, float]     # Kc ini, mid, end
    root_depth_m: float                # max effective rooting depth Zr
    depletion_p: float                 # fraction of TAW before stress
    ky: float                          # seasonal yield response factor
    heat_tcrit_c: float                # Tmax above this in mid-season counts as heat stress
    monoculture_factor: float          # yield multiplier when the crop follows itself
    residue: str                       # high | medium | low (soil index)
    typical_yield_t_ha: float | None   # yield in a typical year under today's climate, after a different crop
    economics: CropEconomics | None
    sources: dict[str, str] = field(default_factory=dict)

    @property
    def season_days(self) -> int:
        return sum(self.stages)


# ---------- economics (2026) ----------

CORN_LB, SOY_LB, OAT_LB, WHEAT_LB = 56.0, 60.0, 32.0, 60.0

_WASDE = "WASDE: Nov 2026, 2026/27 projected season-average farm price"
_ISU_COST = "ISU: A1-20 (2026) total cost per acre, mid-yield budget, incl. $274/ac cash rent and labour"

ECON_MAIZE = CropEconomics(
    price_usd_t=usd_per_bu_to_usd_per_t(4.60, CORN_LB),
    cost_usd_ha=per_acre_to_per_ha(911.98),          # corn following soybeans, 211 bu/ac
    cost_after_self_usd_ha=per_acre_to_per_ha(960.02),  # corn following corn, 193 bu/ac
    sources={"price": f"{_WASDE} ($4.60/bu)", "cost": f"{_ISU_COST}: corn after soybeans $911.98, corn after corn $960.02"},
)
ECON_SOYBEAN = CropEconomics(
    price_usd_t=usd_per_bu_to_usd_per_t(12.10, SOY_LB),
    cost_usd_ha=per_acre_to_per_ha(679.11),          # herbicide-tolerant soybeans after corn, 61 bu/ac
    cost_after_self_usd_ha=None,
    sources={"price": f"{_WASDE} ($12.10/bu)", "cost": f"{_ISU_COST}: soybeans after corn $679.11"},
)
ECON_OATS = CropEconomics(
    price_usd_t=usd_per_bu_to_usd_per_t(3.35, OAT_LB),
    cost_usd_ha=per_acre_to_per_ha(465.0),
    cost_after_self_usd_ha=None,
    sources={
        "price": f"{_WASDE} ($3.35/bu)",
        "cost": "ASSUME: $465/ac = ISU 2026 cash rent $274 + about $190 seed, fertiliser, machinery and labour. "
                "ISU publishes no grain-oat budget; replace with a farm or Practical Farmers of Iowa budget.",
    },
)
IRRIGATION_COST_USD_PER_MM_HA = 0.50
IRRIGATION_COST_SOURCE = ("ASSUME: $0.50 per mm per ha (about $5 per acre-inch) pumping and energy only; "
                          "equipment ownership is not included. Iowa grain is rarely irrigated.")


# ---------- crops ----------


CROPS: dict[str, CropParams] = {c.id: c for c in [
    CropParams(
        id="maize", name="Maize", family="cereal",
        plant_doy=125,                        # ~May 5
        stages=(30, 40, 50, 30),              # FAO-56 T11 "Spain (spr, sum.); Calif." April row
        kc=(0.30, 1.20, 0.35),                # T12; end 0.35 = dried in field
        root_depth_m=1.2, depletion_p=0.55,   # T22 (Zr range 1.0-1.7); scaled per field by the calibrated water storage multiplier
        ky=1.25,                              # T24
        heat_tcrit_c=35.0,
        monoculture_factor=193 / 211,         # ISU A1-20: corn after corn 193 bu/ac vs after soybeans 211 bu/ac
        residue="high",
        typical_yield_t_ha=bu_ac_to_t_ha(211, CORN_LB),
        economics=ECON_MAIZE,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12 (Kc ini = cereals group value)",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat_tcrit_c": "ASSUME: 35 C, a commonly used maize heat threshold",
            "monoculture_factor": "ISU: A1-20 (2026) budget yields, corn after corn 193 vs after soybeans 211 bu/ac",
            "typical_yield_t_ha": "ISU: A1-20 (2026) corn after soybeans, mid budget, 211 bu/ac",
            "plant_doy": "ASSUME: early May, typical for central Iowa",
        },
    ),
    CropParams(
        id="soybean", name="Soybean", family="legume",
        plant_doy=135,                        # ~May 15
        stages=(20, 30, 60, 25),              # T11 "Central USA" May row (dev 30/35)
        kc=(0.40, 1.15, 0.50),
        root_depth_m=1.0, depletion_p=0.50,   # Zr range 0.6-1.3
        ky=0.85,
        heat_tcrit_c=35.0,
        monoculture_factor=0.90,
        residue="low",
        typical_yield_t_ha=bu_ac_to_t_ha(61, SOY_LB),
        economics=ECON_SOYBEAN,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12 (Kc ini = legumes group value)",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat_tcrit_c": "ASSUME: 35 C",
            "monoculture_factor": "ASSUME: about 10% penalty for soybean after soybean",
            "typical_yield_t_ha": "ISU: A1-20 (2026) soybeans after corn, mid budget, 61 bu/ac",
            "plant_doy": "ASSUME: mid May, typical for central Iowa",
        },
    ),
    CropParams(
        id="oats", name="Oats", family="cereal",
        plant_doy=95,                         # ~Apr 5
        stages=(20, 25, 60, 30),              # T11 Barley/Oats/Wheat, "Mar/Apr, 35-45 deg latitude"
        kc=(0.30, 1.15, 0.25),
        root_depth_m=1.2, depletion_p=0.55,   # Zr range 1.0-1.5
        ky=1.15,
        heat_tcrit_c=32.0,
        monoculture_factor=0.92,
        residue="medium",
        typical_yield_t_ha=bu_ac_to_t_ha(80, OAT_LB),
        economics=ECON_OATS,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22",
            "ky": "PROXY: spring wheat value from FAO-56 Table 24 (oats not listed)",
            "heat_tcrit_c": "ASSUME: 32 C, small grains are more heat sensitive than maize",
            "monoculture_factor": "ASSUME",
            "typical_yield_t_ha": "ISU: A1-20 (2026) oat yield assumed in the oat-companion budget, 80 bu/ac",
            "plant_doy": "ASSUME: early April",
        },
    ),
    CropParams(
        id="winter_wheat", name="Winter wheat", family="cereal",
        plant_doy=275,                        # ~Oct 2, harvested the following July
        stages=(160, 75, 75, 25),             # T11 "Idaho, USA" October row (frozen-winter climate)
        kc=(0.40, 1.15, 0.30),                # ini 0.4 = frozen soils; end range 0.25-0.4
        root_depth_m=1.5, depletion_p=0.55,   # Zr range 1.5-1.8
        ky=1.05,
        heat_tcrit_c=32.0,
        monoculture_factor=0.92,
        residue="high",
        typical_yield_t_ha=None,
        economics=None,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat_tcrit_c": "ASSUME: 32 C", "monoculture_factor": "ASSUME", "plant_doy": "ASSUME: early October",
            "typical_yield_t_ha": "none: no Iowa budget found, relative yield only",
        },
    ),
    CropParams(
        id="sunflower", name="Sunflower", family="oilseed",
        plant_doy=135,
        stages=(25, 35, 45, 25),              # T11 "Medit.; California" April/May row
        kc=(0.35, 1.05, 0.35),                # mid range 1.0-1.1
        root_depth_m=1.2, depletion_p=0.45,   # Zr range 0.8-1.5
        ky=0.95,
        heat_tcrit_c=35.0,
        monoculture_factor=0.88,
        residue="medium",
        typical_yield_t_ha=None,
        economics=None,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12 (Kc ini = oil crops group value)",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat_tcrit_c": "ASSUME: 35 C", "monoculture_factor": "ASSUME", "plant_doy": "ASSUME: mid May",
            "typical_yield_t_ha": "none: no Iowa budget found, relative yield only",
        },
    ),
]}
# Chickpea is deliberately absent: FAO-56 has no stage lengths (Table 11) or Ky (Table 24) for it.


# ---------- soils ----------

@dataclass(frozen=True)
class SoilParams:
    texture: str
    theta_fc: float   # volumetric water content at field capacity, m3/m3
    theta_wp: float   # at wilting point

    @property
    def awc_mm_per_m(self) -> float:
        return 1000 * (self.theta_fc - self.theta_wp)


# Midpoints of the FAO-56 Table 19 ranges. Verified against the CRAN package CropWaterBalance
# 0.2.0 (dataset DataForSWC), which reproduces Table 19.
SOILS: dict[str, SoilParams] = {s.texture: s for s in [
    SoilParams("sand", 0.12, 0.045),
    SoilParams("loamy_sand", 0.15, 0.065),
    SoilParams("sandy_loam", 0.23, 0.11),
    SoilParams("loam", 0.25, 0.12),
    SoilParams("silt_loam", 0.29, 0.15),
    SoilParams("silt", 0.32, 0.17),
    SoilParams("silty_clay_loam", 0.335, 0.205),
    SoilParams("silty_clay", 0.36, 0.23),
    SoilParams("clay", 0.36, 0.22),
]}
DEFAULT_SOIL = "loam"
SOIL_TABLE_SOURCE = "FAO: FAO-56 Table 19 midpoints"
PEDOTRANSFER_SOURCE = ("Saxton & Rawls (2006), Soil Sci. Soc. Am. J. 70:1569, field capacity (33 kPa) and "
                       "wilting point (1500 kPa) from SoilGrids sand, clay and organic matter")


# ---------- engine constants ----------

FALLOW_KC = 0.30               # ASSUME: evaporation from bare or residue-covered soil between crops
FALLOW_ROOT_DEPTH_M = 1.0      # ASSUME
MIN_TURNAROUND_DAYS = 7        # ASSUME: harvest -> next planting
PLANT_WINDOW_DAYS = 21         # ASSUME: a crop may be planted up to this many days late; otherwise it waits a year
DAYS_PER_YEAR = 365            # Feb 29 is dropped from the weather so every simulated year has 365 days

# Calibrated against USDA NASS Story County maize yields 2001-2025
# (python -m app.modules.simulator.calibration; results in docs/modules/simulator_calibration.md).
HEAT_LOSS_PER_DEGDAY = 0.002   # CALIB: yield fraction lost per C-day above Tcrit in mid-season
HEAT_LOSS_CAP = 0.40           # ASSUME
# Effective water storage: multiplier on each crop's FAO rooting depth, standing in for deep
# subsoil water and water-table contributions that the one-layer bucket leaves out. Calibrated
# for central Iowa only; other locations use 1.0 (uncalibrated) - see ports.py.
CENTRAL_IOWA_WATER_STORAGE_SCALE = 2.6  # CALIB
DEFAULT_WATER_STORAGE_SCALE = 1.0

STRESS_SEASON_THRESHOLD = 0.70  # a season below 70% of the crop's typical yield counts as poor
NEAR_TIE_MARGIN = 0.03
MODEL_VERSION = "0.2.0"
