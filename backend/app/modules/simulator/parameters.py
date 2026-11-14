"""Crop and soil parameters for the simulator engine. Data only, no logic.

Every value carries where it came from. Three confidence levels:
  FAO   - read from FAO-56 (Allen et al. 1998), table named in `sources`
  PROXY - FAO value for a similar crop or crop group, used because the crop has no own row
  ASSUME - a judgement value. Must be shown in the UI assumptions list and reviewed
           by whoever owns agronomic validation before the demo.

Region: calendars are for central Iowa (demo farm, Story County, ~42 N).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CropParams:
    id: str
    name: str
    family: str                       # cereal | legume | oilseed
    plant_doy: int                    # typical planting day of year
    stages: tuple[int, int, int, int]  # initial, development, mid, late (days)
    kc: tuple[float, float, float]    # Kc ini, mid, end
    root_depth_m: float               # max effective rooting depth Zr
    depletion_p: float                # fraction of TAW before stress
    ky: float                         # seasonal yield response factor
    heat_tcrit_c: float               # Tmax above this in mid-season counts as heat stress
    heat_loss_per_degday: float       # yield fraction lost per C-day above tcrit
    monoculture_factor: float         # yield multiplier when the crop follows itself
    residue: str                      # high | medium | low (for the soil index)
    ref_yield_t_ha: float | None      # no-stress reference yield, for t/ha output
    sources: dict[str, str]

    @property
    def season_days(self) -> int:
        return sum(self.stages)


_HEAT = "ASSUME: 1%/C-day above Tcrit during mid-season, capped at 40% loss. Uncalibrated: see docs/modules/simulator.md section 4."

CROPS: dict[str, CropParams] = {c.id: c for c in [
    CropParams(
        id="maize", name="Maize", family="cereal",
        plant_doy=125,                       # ~May 5
        stages=(30, 40, 50, 30),             # FAO-56 T11, "Spain (spr, sum.); Calif." April row
        kc=(0.30, 1.20, 0.35),               # T12; end 0.35 = dried in field
        root_depth_m=1.2, depletion_p=0.55,  # T22 (Zr range 1.0-1.7)
        ky=1.25,                             # T24
        heat_tcrit_c=35.0, heat_loss_per_degday=0.01,
        monoculture_factor=0.96,
        residue="high", ref_yield_t_ha=12.5,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12 (Kc ini = cereals group value)",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat": _HEAT,
            "monoculture_factor": "ASSUME: ~4% continuous-maize penalty; verify against Seifert et al. 2017 (Agron. J.)",
            "ref_yield_t_ha": "ASSUME: ~200 bu/ac; replace with USDA NASS county yield",
            "plant_doy": "ASSUME: typical central Iowa; verify with Iowa State Extension",
        },
    ),
    CropParams(
        id="soybean", name="Soybean", family="legume",
        plant_doy=135,                       # ~May 15
        stages=(20, 30, 60, 25),             # T11 "Central USA" May row (dev 30/35)
        kc=(0.40, 1.15, 0.50),
        root_depth_m=1.0, depletion_p=0.50,  # Zr range 0.6-1.3
        ky=0.85,
        heat_tcrit_c=35.0, heat_loss_per_degday=0.01,
        monoculture_factor=0.90,
        residue="low", ref_yield_t_ha=3.9,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12 (Kc ini = legumes group value)",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat": _HEAT,
            "monoculture_factor": "ASSUME: ~10% continuous-soybean penalty; verify against Seifert et al. 2017",
            "ref_yield_t_ha": "ASSUME: ~58 bu/ac; replace with USDA NASS county yield",
            "plant_doy": "ASSUME: typical central Iowa",
        },
    ),
    CropParams(
        id="oats", name="Oats (spring)", family="cereal",
        plant_doy=95,                        # ~Apr 5
        stages=(20, 25, 60, 30),             # T11 Barley/Oats/Wheat, "Mar/Apr, 35-45 deg latitude"
        kc=(0.30, 1.15, 0.25),
        root_depth_m=1.2, depletion_p=0.55,  # Zr range 1.0-1.5
        ky=1.15,
        heat_tcrit_c=32.0, heat_loss_per_degday=0.01,
        monoculture_factor=0.92,
        residue="medium", ref_yield_t_ha=2.7,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22",
            "ky": "PROXY: spring wheat value from Table 24 (oats not listed)",
            "heat": _HEAT, "monoculture_factor": "ASSUME",
            "ref_yield_t_ha": "ASSUME: ~75 bu/ac; replace with USDA NASS", "plant_doy": "ASSUME",
        },
    ),
    CropParams(
        id="winter_wheat", name="Winter wheat", family="cereal",
        plant_doy=275,                       # ~Oct 2, harvested the following July
        stages=(160, 75, 75, 25),            # T11 "Idaho, USA" October row (frozen-winter climate)
        kc=(0.40, 1.15, 0.30),               # ini 0.4 = frozen soils; end range 0.25-0.4
        root_depth_m=1.5, depletion_p=0.55,  # Zr range 1.5-1.8
        ky=1.05,
        heat_tcrit_c=32.0, heat_loss_per_degday=0.01,
        monoculture_factor=0.92,
        residue="high", ref_yield_t_ha=4.0,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat": _HEAT, "monoculture_factor": "ASSUME",
            "ref_yield_t_ha": "ASSUME; replace with USDA NASS", "plant_doy": "ASSUME",
        },
    ),
    CropParams(
        id="sunflower", name="Sunflower", family="oilseed",
        plant_doy=135,
        stages=(25, 35, 45, 25),             # T11 "Medit.; California" April/May row
        kc=(0.35, 1.05, 0.35),               # mid range 1.0-1.1
        root_depth_m=1.2, depletion_p=0.45,  # Zr range 0.8-1.5
        ky=0.95,
        heat_tcrit_c=35.0, heat_loss_per_degday=0.01,
        monoculture_factor=0.88,
        residue="medium", ref_yield_t_ha=None,
        sources={
            "stages": "FAO: FAO-56 Table 11", "kc": "FAO: Table 12 (Kc ini = oil crops group value)",
            "root_depth_m": "FAO: Table 22", "depletion_p": "FAO: Table 22", "ky": "FAO: Table 24",
            "heat": _HEAT, "monoculture_factor": "ASSUME", "plant_doy": "ASSUME",
        },
    ),
]}
# Chickpea is deliberately absent: FAO-56 has no stage lengths (Table 11) or Ky (Table 24) for it.


@dataclass(frozen=True)
class SoilParams:
    texture: str
    theta_fc: float   # volumetric water content at field capacity, m3/m3
    theta_wp: float   # at wilting point

    @property
    def awc_mm_per_m(self) -> float:
        return 1000 * (self.theta_fc - self.theta_wp)


# Midpoints of the FAO-56 Table 19 ranges. Written from memory of the table: the page text
# could not be re-read during research, so check each row against Table 19 before relying on it.
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

# Engine constants (all ASSUME unless noted)
FALLOW_KC = 0.30               # evaporation from bare/residue-covered soil between crops
FALLOW_ROOT_DEPTH_M = 1.0
MIN_TURNAROUND_DAYS = 7        # harvest -> next planting
PLANT_WINDOW_DAYS = 21          # a crop may be planted up to this many days after plant_doy; otherwise wait a year
STRESS_SEASON_THRESHOLD = 0.70  # relative yield below this counts as a "stress season"
HEAT_LOSS_CAP = 0.40
NEAR_TIE_MARGIN = 0.03
MODEL_VERSION = "0.1.0"
