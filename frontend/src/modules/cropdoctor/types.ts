// Mirrors backend/app/modules/cropdoctor/schemas.py. Change both together.

export type Kind = "observed" | "modelled" | "scenario";
export type Status = "normal" | "watch" | "alert" | "paused" | "no_data";

export interface Value {
  value: number | null;
  unit: string;
  kind: Kind;
  source: string;
  period_start: string | null; // ISO date
  period_end: string | null;
  normal: number | null;
  normal_low: number | null;
  normal_high: number | null;
  normal_years: number | null;
  diff: number | null;
  diff_unit: "%" | "°C" | null;
}

export interface Indicator {
  id: "greenness" | "rain_30d" | "tmax_30d" | "et0_30d";
  label: string;
  value: Value;
}

export interface Crop {
  label: string;
  year: number | null;
  kind: Kind | null;
  source: string;
}

export interface Soil {
  texture: string | null;
  sand_pct: number | null;
  silt_pct: number | null;
  clay_pct: number | null;
  ph: number | null;
  depth: string | null;
  kind: Kind;
  source: string | null;
}

export interface SeasonPoint {
  doy: number;
  start: string;
  this_year: number | null;
  last_year: number | null;
  two_years_ago: number | null;
  normal: number | null;
  normal_low: number | null;
  normal_high: number | null;
  diff_pct: number | null;
  low: boolean;
}

export interface Explanation {
  id: string;
  text: string;
  check: string;
}

export interface Finding {
  field_id: string;
  field_name: string;
  severity: "watch" | "alert";
  headline: string;
  since: string;
  summary: string;
  explanations: Explanation[];
  caveat: string;
  evidence: Indicator[];
}

export interface FieldHealth {
  id: string;
  name: string;
  boundary: [number, number][]; // [lat, lon], ring not closed
  area_ha: number;
  crop: Crop | null;
  status: Status;
  status_note: string | null;
  greenness: Indicator | null;
  soil: Soil;
  season_year: number;
  season: SeasonPoint[];
}

export interface FarmRef {
  id: string;
  name: string;
  region: string | null;
  center: [number, number] | null;
}

export interface Assumption {
  topic: string;
  text: string;
  source: string;
}

export interface FarmHealth {
  farm: FarmRef;
  as_of: string;
  today: string;
  is_replay: boolean;
  replay_date: string | null;
  data_note: string;
  data_through: string | null;
  greenness_available: boolean;
  weather: Indicator[];
  fields: FieldHealth[];
  findings: Finding[];
  assumptions: Assumption[];
  sources: string[];
}
