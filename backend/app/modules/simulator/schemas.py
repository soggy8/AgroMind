"""API contract for the Simulator module.

This file is the single source of truth for request/response shapes.
`frontend/src/modules/simulator/types.ts` mirrors it by hand: change both together.

Kinds (DESIGN.md section 8): everything in `Scenario` is SCENARIO, everything the engine
computes is MODELLED, and `ClimateSummary(kind="observed")` is OBSERVED (NASA POWER).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Kind = Literal["observed", "modelled", "scenario"]
IrrigationMode = Literal["none", "limited", "full"]
IndicatorId = Literal["yield", "water", "risk", "soil", "margin"]

MAX_ROTATIONS = 4  # DESIGN.md section 7: one colour each from [lime, rain, water, soil]


# ---------- inputs ----------

class Scenario(BaseModel):
    """Hypothetical changes applied to the observed climate baseline."""
    temp_delta_c: float = Field(0.0, ge=-1.0, le=5.0)
    rain_change_pct: float = Field(0.0, ge=-50.0, le=30.0)
    irrigation: IrrigationMode = "none"
    irrigation_cap_mm: float | None = Field(None, ge=0, le=1000, description="Per season; only for 'limited'.")
    years: int = Field(5, ge=1, le=10)
    price_change_pct: float = Field(0.0, ge=-40.0, le=40.0, description="Applied to all crop prices; economics only.")

    @model_validator(mode="after")
    def _cap_only_when_limited(self) -> "Scenario":
        if self.irrigation == "limited" and self.irrigation_cap_mm is None:
            raise ValueError("irrigation_cap_mm is required when irrigation is 'limited'")
        return self


class RotationInput(BaseModel):
    id: str = Field(..., description="Client-chosen, stable within a run (e.g. 'A').")
    name: str
    crops: list[str] = Field(..., min_length=1, max_length=6, description="Crop ids from the catalogue, repeated to fill `years`.")


class Priorities(BaseModel):
    """Relative weights; the service normalises them to sum to 1. Defaults come from CropTwin."""
    yield_: float = Field(1.0, ge=0, alias="yield")
    water: float = Field(1.0, ge=0)
    risk: float = Field(1.0, ge=0)
    soil: float = Field(1.0, ge=0)
    margin: float = Field(0.0, ge=0)

    model_config = {"populate_by_name": True}


class SimulationRequest(BaseModel):
    field_id: str
    rotations: list[RotationInput] = Field(..., min_length=1, max_length=MAX_ROTATIONS)
    scenario: Scenario = Scenario()
    priorities: Priorities | None = Field(None, description="Omit to use the farm's priorities from CropTwin.")
    include_economics: bool = False


# ---------- outputs ----------

class Stat(BaseModel):
    """A modelled value with its spread across the weather-year ensemble."""
    p10: float
    p50: float
    p90: float
    unit: str


class ClimateSummary(BaseModel):
    """Growing-season (May-Sep) averages per year."""
    kind: Kind  # "observed" for the baseline, "scenario" for the perturbed series
    source: str  # e.g. "NASA POWER, 2001-2025"
    growing_season_rain_mm: float
    growing_season_tmax_c: float
    growing_season_et0_mm: float
    hot_days_per_year: float = Field(..., description="Days with Tmax >= 35 C, May-Sep.")
    driest_year: int
    driest_year_rain_mm: float


class SeasonResult(BaseModel):
    """One crop season of one rotation, summarised across the ensemble."""
    season_index: int
    crop_id: str
    year: int                   # simulated year of harvest, 1-based
    plant_date: str             # e.g. "May 5"
    harvest_date: str
    relative_yield: Stat        # 0-1, share of the crop's no-stress yield
    yield_t_ha: Stat | None     # only when the crop has a reference yield
    crop_water_need_mm: Stat    # ETc
    rain_used_mm: Stat
    irrigation_mm: Stat
    water_stress: Stat          # 1 - ETa/ETc
    heat_stress_days: Stat
    limiting_factor: Literal["none", "water", "heat", "rotation"]
    margin_per_ha: Stat | None = None


class Economics(BaseModel):
    revenue_per_ha: Stat
    cost_per_ha: Stat
    margin_per_ha: Stat
    currency: str
    price_source: str
    cost_source: str
    notes: list[str]


class SoilIndex(BaseModel):
    score: int = Field(..., ge=0, le=100)
    components: dict[str, int]  # diversity, legume, residue, continuous_penalty
    notes: list[str]


class VsBaseline(BaseModel):
    """Change against the same rotation under the observed climate (no scenario changes).

    This is the headline the UI leads with: differences are more trustworthy than absolute levels.
    """
    relative_yield_change_pct: float      # change in p50 relative yield, in percent
    irrigation_change_mm_per_year: float
    stress_frequency_change: float        # in share of seasons, e.g. +0.20


class RotationResult(BaseModel):
    rotation_id: str
    input_index: int             # position in the request, keeps the rotation's colour stable
    name: str
    crops: list[str]
    seasons: list[SeasonResult]
    # Per-year averages over the whole run:
    relative_yield: Stat
    irrigation_mm_per_year: Stat
    rain_sufficiency: Stat       # share of crop water need met by rain alone, 0-1
    stress_season_frequency: float  # share of ensemble seasons with relative yield < 0.7
    by_start_year: list[float]   # mean relative yield per ensemble track, aligned with ensemble_start_years
    vs_baseline: VsBaseline
    soil: SoilIndex
    economics: Economics | None
    # Ranking:
    indicator_scores: dict[IndicatorId, float]  # each 0-1, higher is better
    score: float                 # weighted by priorities, 0-1
    rank: int


class Recommendation(BaseModel):
    rotation_id: str
    headline: str                # e.g. "Maize-Soybean-Oats holds up best in this scenario"
    reasons: list[str]           # rule-generated from indicator_scores, cites numbers from this result only
    trade_offs: list[str]
    near_tie: bool               # top two scores within 0.03: say so instead of overclaiming


class Assumption(BaseModel):
    topic: str                   # e.g. "Yield response to water"
    text: str
    source: str                  # e.g. "FAO-56 Eq. 90, Table 24"


class SimulationResult(BaseModel):
    kind: Literal["modelled"] = "modelled"
    field_id: str
    field_name: str
    soil: str                    # e.g. "Clay loam (SoilGrids)"
    calibrated: bool
    scenario: Scenario
    priorities: Priorities
    baseline_climate: ClimateSummary
    scenario_climate: ClimateSummary
    rotations: list[RotationResult]   # sorted by rank
    recommendation: Recommendation
    assumptions: list[Assumption]
    ensemble_size: int
    ensemble_start_years: list[int]
    economics_included: bool
    data_note: str               # e.g. "Sample data (offline)" when the cached series was used
    model_version: str


# ---------- options (to build the form) ----------

class CropOption(BaseModel):
    id: str
    name: str
    family: Literal["cereal", "legume", "oilseed"]
    season: str                  # e.g. "May - Oct"
    notes: str | None = None


class ScenarioPreset(BaseModel):
    id: str
    name: str                    # e.g. "Hotter and drier"
    scenario: Scenario


class FieldOption(BaseModel):
    id: str
    name: str
    crop_id: str                 # current crop
    area_ha: float
    boundary: list[tuple[float, float]]  # (lat, lon) ring
    soil: str
    irrigation_available: bool


class FarmInfo(BaseModel):
    id: str
    name: str
    region: str
    center: tuple[float, float]


class SimulatorOptions(BaseModel):
    farm: FarmInfo
    fields: list[FieldOption]
    weather_source: str
    calibration_note: str
    crops: list[CropOption]
    suggested_rotations: list[RotationInput]
    scenario_presets: list[ScenarioPreset]
    default_priorities: Priorities
    default_irrigation: IrrigationMode


# ---------- saved runs ----------

class SaveRunRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    request: SimulationRequest


class SavedRunSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    scenario: Scenario
    rotation_names: list[str]
    recommended_rotation: str


class SavedRun(SavedRunSummary):
    request: SimulationRequest
    result: SimulationResult


# ---------- advisor hand-off ----------

class AdvisorContext(BaseModel):
    """Everything the AI advisor may use to explain a result. It must not go beyond these facts."""
    instructions: str
    facts: list[str]
    suggested_questions: list[str]
