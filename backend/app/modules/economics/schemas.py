"""API contract for the Economics module.

This file is the single source of truth for request/response shapes.
`frontend/src/modules/economics/types.ts` mirrors it by hand: change both together.

Kinds (DESIGN.md section 8): scenario inputs and the user's own numbers are SCENARIO, everything
the model computes is MODELLED, and field area from CropTwin is OBSERVED.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .parameters import DEFAULT_PRICE_STEPS_PCT, DEFAULT_WARMING_C

Kind = Literal["observed", "modelled", "scenario"]
Units = Literal["metric", "us"]
IrrigationMode = Literal["none", "limited", "full"]
HeatResponse = Literal["published", "local"]
Land = Literal["rent", "own"]

MAX_ROTATIONS = 4  # DESIGN.md section 7: one colour each from [lime, rain, water, soil]


# ---------- inputs ----------

class EconScenario(BaseModel):
    """Same limits as the Simulator's Scenario, without the price change (that is a request field)."""
    temp_delta_c: float = Field(0.0, ge=-1.0, le=5.0)
    rain_change_pct: float = Field(0.0, ge=-50.0, le=30.0)
    irrigation: IrrigationMode = "none"
    irrigation_cap_mm: float | None = Field(None, ge=0, le=1000, description="Per season; only for 'limited'.")
    years: int = Field(5, ge=1, le=10)
    projection: str | None = Field(
        None, pattern=r"^ssp\d{3}_\d{4}s$",
        description="NASA NEX-GDDP-CMIP6 projection id, e.g. 'ssp245_2050s'.")
    heat_response: HeatResponse = "published"

    @model_validator(mode="after")
    def _cap_only_when_limited(self) -> "EconScenario":
        if self.irrigation == "limited" and self.irrigation_cap_mm is None:
            raise ValueError("irrigation_cap_mm is required when irrigation is 'limited'")
        return self


class RotationInput(BaseModel):
    id: str = Field(..., description="Client-chosen, stable within a run (e.g. 'A').")
    name: str
    crops: list[str] = Field(..., min_length=1, max_length=6)
    cover_crop: bool = False


class YourNumbers(BaseModel):
    """The farmer's own money numbers; anything left out falls back to a sourced default."""
    land: Land = "rent"
    rent_usd_ha: float | None = Field(None, ge=0)
    prices_usd_t: dict[str, float] = Field(default_factory=dict, description="Crop id to USD per tonne; each > 0.")
    costs_before_rent_usd_ha: dict[str, float] = Field(default_factory=dict, description="Crop id to USD per ha; each >= 0.")
    irrigation_usd_per_mm_ha: float | None = Field(None, ge=0)
    cover_crop_usd_ha: float | None = Field(None, ge=0)

    @field_validator("prices_usd_t")
    @classmethod
    def _prices_positive(cls, v: dict[str, float]) -> dict[str, float]:
        bad = sorted(k for k, x in v.items() if not x > 0)
        if bad:
            raise ValueError(f"prices must be greater than 0: {', '.join(bad)}")
        return v

    @field_validator("costs_before_rent_usd_ha")
    @classmethod
    def _costs_not_negative(cls, v: dict[str, float]) -> dict[str, float]:
        bad = sorted(k for k, x in v.items() if not x >= 0)
        if bad:
            raise ValueError(f"costs must not be negative: {', '.join(bad)}")
        return v


def _sorted_unique(values: list[float], lo: float, hi: float, name: str) -> list[float]:
    if len(set(values)) != len(values):
        raise ValueError(f"{name} must not contain duplicates")
    out_of_range = [x for x in values if not lo <= x <= hi]
    if out_of_range:
        raise ValueError(f"{name} values must be between {lo:g} and {hi:g}, got {out_of_range}")
    return sorted(values)


class GridSpec(BaseModel):
    """Axes of the who-earns-most grid: rows are warming, columns are price change."""
    warming_c: list[float] = Field(default_factory=lambda: list(DEFAULT_WARMING_C), min_length=2, max_length=7)
    price_change_pct: list[float] = Field(default_factory=lambda: list(DEFAULT_PRICE_STEPS_PCT), min_length=2, max_length=9)

    @field_validator("warming_c")
    @classmethod
    def _warming(cls, v: list[float]) -> list[float]:
        return _sorted_unique(v, -1.0, 5.0, "warming_c")

    @field_validator("price_change_pct")
    @classmethod
    def _prices(cls, v: list[float]) -> list[float]:
        return _sorted_unique(v, -40.0, 40.0, "price_change_pct")


class EconomicsRequest(BaseModel):
    field_id: str
    rotations: list[RotationInput] | None = Field(
        None, min_length=1, max_length=MAX_ROTATIONS, description="Omit to use the suggested rotations.")
    scenario: EconScenario = Field(default_factory=EconScenario)
    price_change_pct: float = Field(0.0, ge=-40.0, le=40.0)
    price_crop: str | None = Field(None, description="Apply the price change to this crop only; omit for all crops.")
    your_numbers: YourNumbers = Field(default_factory=YourNumbers)
    grid: GridSpec = Field(default_factory=GridSpec)
    units: Units = Field("metric", description="Units for generated sentences only; numbers are always metric.")

    @model_validator(mode="after")
    def _unique_rotation_ids(self) -> "EconomicsRequest":
        if self.rotations:
            ids = [r.id for r in self.rotations]
            if len(set(ids)) != len(ids):
                raise ValueError("rotation ids must be unique")
        return self


# ---------- outputs ----------

class Stat(BaseModel):
    p10: float
    p50: float
    p90: float
    unit: str


class MoneyInput(BaseModel):
    """One number the money maths used. Ids: price.<crop>, yield.<crop>, cost.<crop>,
    cost_after_self.maize, rent, irrigation, cover_crop."""
    id: str
    label: str
    value: float
    unit: str
    display: str
    kind: Kind = "scenario"
    source: str


class Area(BaseModel):
    value_ha: float
    kind: Kind = "observed"
    source: str


class BestAlternative(BaseModel):
    rotation_id: str
    name: str
    scenario_margin: Stat
    wins_back_usd_ha: float
    wins_back_share: float | None


class ClimateBill(BaseModel):
    kind: Kind = "modelled"
    rotation_id: str
    name: str
    today: Stat
    scenario: Stat
    change: Stat
    change_whole_field: Stat
    other_heat_response: HeatResponse
    other_heat_response_change_usd_ha: float
    best_alternative: BestAlternative | None
    sentence: str
    sources: list[str]


class BadYears(BaseModel):
    kind: Kind = "modelled"
    rotation_id: str
    name: str
    annual_margin: Stat
    season_margin: Stat
    seasons_total: int
    losing_season_share: float
    losing_runs: int
    runs: int
    worst_season_usd_ha: float
    cash_cushion_worst_usd_ha: float
    cash_cushion_typical_usd_ha: float
    sentence: str


class GridCell(BaseModel):
    winner_rotation_id: str | None
    near_tie: bool
    margin_p50_usd_ha: dict[str, float]


class YourCell(BaseModel):
    row: int
    col: int
    exact: bool


class WhoEarnsMost(BaseModel):
    kind: Kind = "modelled"
    warming_c: list[float]
    price_change_pct: list[float]
    price_crop: str | None
    rain_change_pct: float
    rain_change_source: str
    cells: list[list[GridCell]]  # cells[row][col], rows = warming
    your_cell: YourCell
    sentence: str


class ExcludedRotation(BaseModel):
    rotation_id: str
    reason: str


class Assumption(BaseModel):
    topic: str
    text: str
    source: str


class EconomicsReport(BaseModel):
    kind: Kind = "modelled"
    farm_id: str
    field_id: str
    field_name: str
    area: Area
    scenario: EconScenario
    scenario_kind: Kind = "scenario"
    scenario_label: str
    price_change_pct: float
    price_crop: str | None
    units: Units
    yours_rotation_id: str
    yours_assumed: bool
    climate_bill: ClimateBill
    bad_years: list[BadYears]
    who_earns_most: WhoEarnsMost | None
    inputs_used: list[MoneyInput]
    excluded_rotations: list[ExcludedRotation]
    assumptions: list[Assumption]
    notes: list[str]
    calibrated: bool
    ensemble_size: int
    ensemble_start_years: list[int]
    data_note: str
    simulator_model_version: str
    currency: str = "USD"


class EconomicsDefaults(BaseModel):
    kind: Kind = "scenario"
    inputs: list[MoneyInput]
    suggested_rotations: list[RotationInput]
    default_yours_rotation_id: str
    grid: GridSpec
    currency: str = "USD"
