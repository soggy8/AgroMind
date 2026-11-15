// Mirrors backend/app/modules/economics/schemas.py. Change both together.

export type Kind = "observed" | "modelled" | "scenario";
export type Units = "metric" | "us";
export type IrrigationMode = "none" | "limited" | "full";
export type HeatResponse = "published" | "local";
export type Land = "rent" | "own";

export const MAX_ROTATIONS = 4;

// ---------- inputs ----------

export interface EconScenario {
  temp_delta_c: number; // -1 .. 5
  rain_change_pct: number; // -50 .. 30
  irrigation: IrrigationMode;
  irrigation_cap_mm: number | null; // per season, required when irrigation is "limited"
  years: number; // 1 .. 10
  projection: string | null; // NASA NEX-GDDP-CMIP6 id, e.g. "ssp245_2050s"
  heat_response: HeatResponse;
}

export interface RotationInput {
  id: string;
  name: string;
  crops: string[]; // crop ids, 1 .. 6
  cover_crop?: boolean;
}

export interface YourNumbers {
  land: Land;
  rent_usd_ha: number | null; // >= 0
  prices_usd_t: Record<string, number>; // crop id -> USD per tonne, each > 0
  costs_before_rent_usd_ha: Record<string, number>; // crop id -> USD per ha, each >= 0
  irrigation_usd_per_mm_ha: number | null; // >= 0
  cover_crop_usd_ha: number | null; // >= 0
}

export interface GridSpec {
  warming_c: number[]; // 2 .. 7 unique values in -1 .. 5, sorted ascending
  price_change_pct: number[]; // 2 .. 9 unique values in -40 .. 40, sorted ascending
}

export interface EconomicsRequest {
  field_id: string;
  rotations: RotationInput[] | null; // 1 .. 4, unique ids; null = suggested rotations
  scenario: EconScenario;
  price_change_pct: number; // -40 .. 40
  price_crop: string | null; // null = all crops
  your_numbers: YourNumbers;
  grid: GridSpec;
  units: Units; // only changes generated sentences; numbers are always metric
}

// ---------- outputs ----------

export interface Stat {
  p10: number;
  p50: number;
  p90: number;
  unit: string;
}

// ids: price.<crop>, yield.<crop>, cost.<crop>, cost_after_self.maize, rent, irrigation, cover_crop
export interface MoneyInput {
  id: string;
  label: string;
  value: number;
  unit: string;
  display: string;
  kind: Kind;
  source: string;
}

export interface Area {
  value_ha: number;
  kind: Kind;
  source: string;
}

export interface BestAlternative {
  rotation_id: string;
  name: string;
  scenario_margin: Stat;
  wins_back_usd_ha: number;
  wins_back_share: number | null;
}

export interface ClimateBill {
  kind: Kind;
  rotation_id: string;
  name: string;
  today: Stat;
  scenario: Stat;
  change: Stat;
  change_whole_field: Stat;
  other_heat_response: HeatResponse;
  other_heat_response_change_usd_ha: number;
  best_alternative: BestAlternative | null;
  sentence: string;
  sources: string[];
}

export interface BadYears {
  kind: Kind;
  rotation_id: string;
  name: string;
  annual_margin: Stat;
  season_margin: Stat;
  seasons_total: number;
  losing_season_share: number;
  losing_runs: number;
  runs: number;
  worst_season_usd_ha: number;
  cash_cushion_worst_usd_ha: number;
  cash_cushion_typical_usd_ha: number;
  sentence: string;
  sources: string[];
}

export interface GridCell {
  winner_rotation_id: string | null;
  near_tie: boolean;
  margin_p50_usd_ha: Record<string, number>;
}

export interface YourCell {
  row: number;
  col: number;
  exact: boolean;
}

export interface WhoEarnsMost {
  kind: Kind;
  warming_c: number[];
  price_change_pct: number[];
  price_crop: string | null;
  rain_change_pct: number;
  rain_change_source: string;
  cells: GridCell[][]; // cells[row][col], rows = warming
  your_cell: YourCell;
  sentence: string;
  sources: string[];
}

export interface ExcludedRotation {
  rotation_id: string;
  reason: string;
}

export interface Assumption {
  topic: string;
  text: string;
  source: string;
}

export interface EconomicsReport {
  kind: Kind;
  farm_id: string;
  field_id: string;
  field_name: string;
  area: Area;
  scenario: EconScenario;
  scenario_kind: Kind;
  scenario_label: string;
  price_change_pct: number;
  price_crop: string | null;
  units: Units;
  yours_rotation_id: string;
  yours_assumed: boolean;
  climate_bill: ClimateBill;
  bad_years: BadYears[];
  who_earns_most: WhoEarnsMost | null;
  inputs_used: MoneyInput[];
  excluded_rotations: ExcludedRotation[];
  assumptions: Assumption[];
  notes: string[];
  calibrated: boolean;
  ensemble_size: number;
  ensemble_start_years: number[];
  data_note: string;
  simulator_model_version: string;
  currency: string;
}

export interface EconomicsDefaults {
  kind: Kind;
  inputs: MoneyInput[];
  suggested_rotations: RotationInput[];
  default_yours_rotation_id: string;
  grid: GridSpec;
  currency: string;
}
