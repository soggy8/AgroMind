"""CropDoctor's API contract. Mirrored by frontend/src/modules/cropdoctor/types.ts: change both together."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel

Kind = Literal["observed", "modelled", "scenario"]
Status = Literal["normal", "watch", "alert", "paused", "no_data"]


class Value(BaseModel):
    value: float | None
    unit: str
    kind: Kind
    source: str
    period_start: date | None = None
    period_end: date | None = None
    normal: float | None = None
    normal_low: float | None = None
    normal_high: float | None = None
    normal_years: int | None = None
    diff: float | None = None
    diff_unit: Literal["%", "°C"] | None = None


class Indicator(BaseModel):
    id: Literal["greenness", "rain_30d", "tmax_30d", "et0_30d"]
    label: str
    value: Value


class Crop(BaseModel):
    label: str
    year: int | None
    kind: Kind | None
    source: str


class Soil(BaseModel):
    texture: str | None
    sand_pct: float | None
    silt_pct: float | None
    clay_pct: float | None
    ph: float | None
    depth: str | None
    kind: Kind = "modelled"
    source: str | None


class SeasonPoint(BaseModel):
    doy: int
    start: date
    this_year: float | None
    last_year: float | None
    two_years_ago: float | None
    normal: float | None
    normal_low: float | None
    normal_high: float | None
    diff_pct: float | None
    low: bool


class Explanation(BaseModel):
    id: str
    text: str
    check: str


class Finding(BaseModel):
    field_id: str
    field_name: str
    severity: Literal["watch", "alert"]
    headline: str
    since: date
    summary: str
    explanations: list[Explanation]
    caveat: str
    evidence: list[Indicator]


class FieldHealth(BaseModel):
    id: str
    name: str
    boundary: list[tuple[float, float]]
    area_ha: float
    crop: Crop | None
    status: Status
    status_note: str | None
    greenness: Indicator | None
    soil: Soil
    season_year: int
    season: list[SeasonPoint]


class FarmRef(BaseModel):
    id: str
    name: str
    region: str | None
    center: tuple[float, float] | None


class Assumption(BaseModel):
    topic: str
    text: str
    source: str


class FarmHealth(BaseModel):
    farm: FarmRef
    as_of: date
    today: date
    is_replay: bool
    replay_date: date | None
    data_note: str
    data_through: date | None
    greenness_available: bool
    weather: list[Indicator]
    fields: list[FieldHealth]
    findings: list[Finding]
    assumptions: list[Assumption]
    sources: list[str]


class AdvisorContext(BaseModel):
    """Everything the AI advisor may use to explain a health check. It must not go beyond these facts."""
    instructions: str
    facts: list[str]
    suggested_questions: list[str]
