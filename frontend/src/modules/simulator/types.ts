// Mirrors backend/app/modules/simulator/schemas.py. Change both together.

export type Kind = "observed" | "modelled" | "scenario";
export type IrrigationMode = "none" | "limited" | "full";
export type IndicatorId = "yield" | "water" | "risk" | "soil" | "margin";

export const MAX_ROTATIONS = 4;

// ---------- inputs ----------

export interface Scenario {
  temp_delta_c: number; // -1 .. 5
  rain_change_pct: number; // -50 .. 30
  irrigation: IrrigationMode;
  irrigation_cap_mm: number | null; // per season, required when irrigation is "limited"
  years: number; // 1 .. 10
  price_change_pct: number; // -40 .. 40, economics only
}

export interface RotationInput {
  id: string;
  name: string;
  crops: string[]; // crop ids, 1 .. 6
}

export type Priorities = Record<IndicatorId, number>;

export interface SimulationRequest {
  field_id: string;
  rotations: RotationInput[];
  scenario: Scenario;
  priorities: Priorities | null; // null = use the farm's priorities
  include_economics: boolean;
}

// ---------- outputs ----------

export interface Stat {
  p10: number;
  p50: number;
  p90: number;
  unit: string;
}

/** Growing-season (May-Sep) averages per year. */
export interface ClimateSummary {
  kind: Kind;
  source: string;
  growing_season_rain_mm: number;
  growing_season_tmax_c: number;
  growing_season_et0_mm: number;
  hot_days_per_year: number;
  driest_year: number;
  driest_year_rain_mm: number;
}

export interface SeasonResult {
  season_index: number;
  crop_id: string;
  year: number; // simulated year of harvest, 1-based
  plant_date: string;
  harvest_date: string;
  relative_yield: Stat;
  yield_t_ha: Stat | null;
  crop_water_need_mm: Stat;
  rain_used_mm: Stat;
  irrigation_mm: Stat;
  water_stress: Stat;
  heat_stress_days: Stat;
  limiting_factor: "none" | "water" | "heat" | "rotation";
  margin_per_ha: Stat | null;
}

export interface Economics {
  revenue_per_ha: Stat;
  cost_per_ha: Stat;
  margin_per_ha: Stat;
  currency: string;
  price_source: string;
  cost_source: string;
  notes: string[];
}

export interface SoilIndex {
  score: number; // 0 .. 100
  components: Record<string, number>;
  notes: string[];
}

export interface VsBaseline {
  relative_yield_change_pct: number;
  irrigation_change_mm_per_year: number;
  stress_frequency_change: number;
}

export interface RotationResult {
  rotation_id: string;
  input_index: number; // position in the request: keeps the rotation's colour stable
  name: string;
  crops: string[];
  seasons: SeasonResult[];
  relative_yield: Stat;
  irrigation_mm_per_year: Stat;
  rain_sufficiency: Stat;
  stress_season_frequency: number;
  by_start_year: number[]; // aligned with SimulationResult.ensemble_start_years
  vs_baseline: VsBaseline;
  soil: SoilIndex;
  economics: Economics | null;
  indicator_scores: Partial<Record<IndicatorId, number>>;
  score: number;
  rank: number;
}

export interface Recommendation {
  rotation_id: string;
  headline: string;
  reasons: string[];
  trade_offs: string[];
  near_tie: boolean;
}

export interface Assumption {
  topic: string;
  text: string;
  source: string;
}

export interface SimulationResult {
  kind: "modelled";
  field_id: string;
  field_name: string;
  soil: string;
  calibrated: boolean;
  scenario: Scenario;
  priorities: Priorities;
  baseline_climate: ClimateSummary;
  scenario_climate: ClimateSummary;
  rotations: RotationResult[]; // sorted by rank
  recommendation: Recommendation;
  assumptions: Assumption[];
  ensemble_size: number;
  ensemble_start_years: number[];
  economics_included: boolean;
  data_note: string;
  model_version: string;
}

// ---------- options ----------

export interface CropOption {
  id: string;
  name: string;
  family: "cereal" | "legume" | "oilseed";
  season: string;
  notes: string | null;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  scenario: Scenario;
}

export interface FieldOption {
  id: string;
  name: string;
  crop_id: string;
  area_ha: number;
  boundary: [number, number][]; // (lat, lon) ring
  soil: string;
  irrigation_available: boolean;
}

export interface FarmInfo {
  id: string;
  name: string;
  region: string;
  center: [number, number];
}

export interface SimulatorOptions {
  farm: FarmInfo;
  fields: FieldOption[];
  weather_source: string;
  calibration_note: string;
  crops: CropOption[];
  suggested_rotations: RotationInput[];
  scenario_presets: ScenarioPreset[];
  default_priorities: Priorities;
  default_irrigation: IrrigationMode;
}

// ---------- saved runs ----------

export interface SaveRunRequest {
  name: string;
  request: SimulationRequest;
}

export interface SavedRunSummary {
  id: string;
  name: string;
  created_at: string; // ISO 8601
  scenario: Scenario;
  rotation_names: string[];
  recommended_rotation: string;
}

export interface SavedRun extends SavedRunSummary {
  request: SimulationRequest;
  result: SimulationResult;
}

// ---------- advisor hand-off ----------

export interface AdvisorContext {
  instructions: string;
  facts: string[];
  suggested_questions: string[];
}
