/**
 * CropTwin API contract. Mirrors backend/app/modules/croptwin/schemas.py: change both together.
 */

/** The crops the Simulator models. Must equal CropId in schemas.py and the keys of simulator.parameters.CROPS
 * (three copies, recorded in docs/modules/croptwin.md). */
export const CROPS = [
  { id: "maize", name: "Maize" },
  { id: "soybean", name: "Soybean" },
  { id: "oats", name: "Oats" },
  { id: "winter_wheat", name: "Winter wheat" },
  { id: "sunflower", name: "Sunflower" },
] as const;
export type CropId = (typeof CROPS)[number]["id"];

/** FAO-56 Table 19 texture classes (SoilTexture in schemas.py). */
export const SOIL_TEXTURES = [
  { id: "sand", name: "Sand" },
  { id: "loamy_sand", name: "Loamy sand" },
  { id: "sandy_loam", name: "Sandy loam" },
  { id: "loam", name: "Loam" },
  { id: "silt_loam", name: "Silt loam" },
  { id: "silt", name: "Silt" },
  { id: "silty_clay_loam", name: "Silty clay loam" },
  { id: "silty_clay", name: "Silty clay" },
  { id: "clay", name: "Clay" },
] as const;
export type SoilTexture = (typeof SOIL_TEXTURES)[number]["id"];

export type AreaSource = "computed_from_boundary" | "farmer";

/** GeoJSON Polygon, coordinates as [longitude, latitude]. */
export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface FarmPriorities {
  yield: number;
  water: number;
  risk: number;
  soil: number;
  margin: number;
}
export type PriorityId = keyof FarmPriorities;

// ---------- requests ----------

/** The farm's point (WGS84), where its map opens before any field is drawn. Send both or neither. */
export interface FarmPoint {
  location_lat?: number | null;
  location_lon?: number | null;
}

export interface FarmCreate extends FarmPoint {
  name: string;
  region?: string | null;
  priorities?: FarmPriorities;
  constraints?: string | null;
}

export interface FarmUpdate extends FarmPoint {
  name?: string;
  region?: string | null;
  priorities?: FarmPriorities;
  constraints?: string | null;
}

export interface FieldCreate {
  name: string;
  boundary: GeoJSONPolygon;
  /** Farmer-stated area. Omit to compute it from the boundary. */
  area_ha?: number | null;
  irrigation_available?: boolean;
  current_crop_id?: CropId | null;
  soil_texture?: SoilTexture | null;
}

export interface FieldUpdate {
  name?: string;
  boundary?: GeoJSONPolygon;
  /** Farmer-stated area. null switches back to the area computed from the boundary. */
  area_ha?: number | null;
  irrigation_available?: boolean;
  current_crop_id?: CropId | null;
  soil_texture?: SoilTexture | null;
}

export interface SoilLayerIn {
  depth_top_cm: number;
  depth_bottom_cm: number;
  sand_pct: number | null;
  silt_pct: number | null;
  clay_pct: number | null;
  soc_g_kg: number | null;
  ph: number | null;
  /** Where the values came from. */
  source: string;
}

export interface CropHistoryIn {
  season_year: number;
  crop_id: CropId;
  yield_value?: number | null;
  yield_unit?: string | null;
  source?: string;
  notes?: string | null;
}

// ---------- responses ----------

export interface SoilLayerOut extends SoilLayerIn {
  id: string;
  retrieved_at: string;
}

export interface CropHistoryOut {
  id: string;
  season_year: number;
  crop_id: CropId;
  yield_value: number | null;
  yield_unit: string | null;
  source: string;
  notes: string | null;
}

export interface FieldOut {
  id: string;
  farm_id: string;
  name: string;
  boundary: GeoJSONPolygon;
  centroid_lat: number;
  centroid_lon: number;
  area_ha: number;
  area_source: AreaSource;
  irrigation_available: boolean;
  current_crop_id: string | null;
  soil_texture: SoilTexture | null;
  soil_layers: SoilLayerOut[];
  crop_history: CropHistoryOut[];
  created_at: string;
  updated_at: string;
}

export interface FarmOut {
  id: string;
  name: string;
  region: string | null;
  priorities: FarmPriorities;
  constraints: string | null;
  location_lat: number | null;
  location_lon: number | null;
  fields: FieldOut[];
  created_at: string;
  updated_at: string;
}

/** A place-search result (OpenStreetMap via Nominatim). bbox is [south, west, north, east] in degrees. */
export interface PlaceOut {
  name: string;
  lat: number;
  lon: number;
  bbox: [number, number, number, number] | null;
  kind: string | null;
}

export interface PlaceSearch {
  results: PlaceOut[];
  attribution: string;
}

/** A GIBS map pixel looked up in NASA's colour map (backend: colour_classes.py). Never interpolated. */
export interface ColourReading {
  status: "class" | "nodata" | "transparent" | "unknown";
  low: number | null;
  high: number | null;
  range_text: string | null;
  units: string | null;
  title: string | null;
  label: string | null;
}

export interface WeatherSeries {
  id: string;
  name: string;
  units: string;
  dates: string[];
  values: (number | null)[];
}

/** Recent daily NASA POWER weather at a field's centroid (Modelled). */
export interface WeatherOut {
  source: string;
  sources: string[];
  latitude: number;
  longitude: number;
  start: string | null;
  end: string | null;
  time_standard: string | null;
  series: WeatherSeries[];
}

export interface FarmSummary {
  id: string;
  name: string;
  region: string | null;
  field_count: number;
}
