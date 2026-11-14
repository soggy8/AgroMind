/**
 * CropTwin: the editor's working copy of a field (FieldDraft) and the rules for turning it into API requests: what
 * changed, and checks before saving (a name, a closed outline, no crossing edges, no overlap with other fields, a valid
 * area). Pure functions with no React. Used by state/useFarmProfile.ts and the panels.
 */
import type { ValueKind } from "../../../shared/components";
import { type LatLng, listNames, overlaps, selfIntersects } from "../../../shared/map/BoundaryDraw";
import {
  CROPS, type CropId, type FieldCreate, type FieldOut, type FieldUpdate, type GeoJSONPolygon, type SoilLayerIn,
  type SoilTexture,
} from "../types";

/** The `source` saved with values the farmer typed in (soilKind() treats these as OBSERVED). */
export const FARMER_SOURCE = "Farmer-provided";

export interface SoilLayerDraft extends SoilLayerIn {
  key: string;
  retrieved_at?: string;
}

/** A field as the editor holds it, saved or not. `ring` is the open outer ring as (lat, lon). */
export interface FieldDraft {
  id: string;
  isNew: boolean;
  name: string;
  ring: LatLng[];
  closed: boolean;
  current_crop_id: CropId | null;
  irrigation_available: boolean;
  soil_texture: SoilTexture | null;
  /** Farmer-stated area as typed; empty means "compute it from the boundary". */
  areaInput: string;
  soil: SoilLayerDraft[];
}

let seq = 0;
/** A key unique for this page load, for drafts and layers that have no server id yet. */
export const nextKey = (prefix: string) => `${prefix}-${++seq}`;

/** GeoJSON outer ring ([lon, lat], closed) to the editor's open ring of (lat, lon). */
export function toRing(boundary: GeoJSONPolygon): LatLng[] {
  const ring = boundary.coordinates[0].map(([lon, lat]) => [lat, lon] as LatLng);
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return ring.length > 1 && a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
}

/** The editor's open (lat, lon) ring back to a closed GeoJSON Polygon in [lon, lat] order. */
export function toPolygon(ring: LatLng[]): GeoJSONPolygon {
  const coords = ring.map(([lat, lon]) => [lon, lat] as [number, number]);
  return { type: "Polygon", coordinates: [[...coords, coords[0]]] };
}

export const isCropId = (id: string | null): id is CropId => CROPS.some((c) => c.id === id);
export const cropName = (id: string | null) => CROPS.find((c) => c.id === id)?.name ?? id ?? "";

/** A saved field as a draft. A computed area shows as empty, so it stays computed. */
export function draftFromField(f: FieldOut): FieldDraft {
  return {
    id: f.id,
    isNew: false,
    name: f.name,
    ring: toRing(f.boundary),
    closed: true,
    current_crop_id: isCropId(f.current_crop_id) ? f.current_crop_id : null,
    irrigation_available: f.irrigation_available,
    soil_texture: f.soil_texture,
    areaInput: f.area_source === "farmer" ? String(f.area_ha) : "",
    soil: f.soil_layers.map(({ id, retrieved_at, ...layer }) => ({ ...layer, key: id, retrieved_at })),
  };
}

/** An empty, undrawn draft named "Field n". */
export function newDraft(n: number): FieldDraft {
  return {
    id: nextKey("new"), isNew: true, name: `Field ${n}`, ring: [], closed: false, current_crop_id: null,
    irrigation_available: false, soil_texture: null, areaInput: "", soil: [],
  };
}

const soilIn = (s: SoilLayerDraft[]): SoilLayerIn[] =>
  s.map(({ depth_top_cm, depth_bottom_cm, sand_pct, silt_pct, clay_pct, soc_g_kg, ph, source }) =>
    ({ depth_top_cm, depth_bottom_cm, sand_pct, silt_pct, clay_pct, soc_g_kg, ph, source }));

/** The typed area: null when empty (use the computed area), a number above 0, or "invalid". */
export const parseArea = (s: string): number | null | "invalid" => {
  if (!s.trim()) return null;
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : "invalid";
};

/** A drawn outline: closed, with at least three corners. Only these count for the overlap check. */
const finished = (d: FieldDraft) => d.closed && d.ring.length >= 3;

/** Names of the other fields whose outlines share area with this draft's (touching edges don't count). */
export function overlappingNames(d: FieldDraft, all: FieldDraft[]): string[] {
  return overlappingFields(d, all).map((o) => o.name.trim() || "an unnamed field");
}

/** The other finished fields this draft's outline shares area with. An outline still being drawn is checked as if
 * closed, so the warning shows while drawing. */
export function overlappingFields(d: FieldDraft, all: FieldDraft[]): FieldDraft[] {
  if (d.ring.length < 3) return [];
  return all.filter((o) => o.id !== d.id && finished(o) && overlaps(d.ring, o.ring));
}

/** True for a new field, or a saved one whose outline was changed (the cases the overlap rule applies to). */
export const boundaryIsNew = (d: FieldDraft, saved?: FieldOut) =>
  !saved || JSON.stringify(d.ring) !== JSON.stringify(toRing(saved.boundary));

/** What to send for a draft, or a problem to show. `soil` is null when the layers didn't change. `others` are the
 * farm's other drafts, for the overlap rule; fields that already overlapped can still be saved if their outline
 * didn't change. */
export function changesFor(d: FieldDraft, saved?: FieldOut, others: FieldDraft[] = []):
  { error: string } | { create?: FieldCreate; update?: FieldUpdate; soil: SoilLayerIn[] | null } {
  const name = d.name.trim();
  if (!name) return { error: "Give the field a name." };
  if (!d.closed || d.ring.length < 3) return { error: `Finish drawing ${name}'s boundary (at least three corners).` };
  if (selfIntersects(d.ring)) return { error: `${name}'s boundary edges cross. Drag a corner or redraw it so the outline doesn't loop over itself.` };
  const hits = boundaryIsNew(d, saved) ? overlappingNames(d, others) : [];
  if (hits.length) return { error: `${name} overlaps ${listNames(hits)}. Adjust its boundary so fields don't share area.` };
  const area = parseArea(d.areaInput);
  if (area === "invalid") return { error: `${name}'s area must be a number of hectares above 0, or empty.` };
  const soil = soilIn(d.soil);
  if (!saved) {
    return {
      create: { name, boundary: toPolygon(d.ring), area_ha: area, irrigation_available: d.irrigation_available,
        current_crop_id: d.current_crop_id, soil_texture: d.soil_texture },
      soil: soil.length ? soil : null,
    };
  }
  const base = draftFromField(saved);
  const update: FieldUpdate = {};
  if (name !== base.name) update.name = name;
  if (JSON.stringify(d.ring) !== JSON.stringify(base.ring)) update.boundary = toPolygon(d.ring);
  if (d.areaInput.trim() !== base.areaInput) update.area_ha = area;
  if (d.irrigation_available !== base.irrigation_available) update.irrigation_available = d.irrigation_available;
  if (d.current_crop_id !== base.current_crop_id) update.current_crop_id = d.current_crop_id;
  if (d.soil_texture !== base.soil_texture) update.soil_texture = d.soil_texture;
  const soilChanged = JSON.stringify(soil) !== JSON.stringify(soilIn(base.soil));
  return { update: Object.keys(update).length ? update : undefined, soil: soilChanged ? soil : null };
}

/** True for a new field, a changed one, or one that can't be saved as it stands. */
export function isDirty(d: FieldDraft, saved?: FieldOut): boolean {
  if (!saved) return true;
  const c = changesFor(d, saved);
  return "error" in c || !!c.update || c.soil !== null;
}

/** SoilGrids values are mapped estimates (~250 m), so MODELLED; farmer and lab entries are OBSERVED. */
export const soilKind = (source: string): ValueKind => (source.includes("SoilGrids") ? "modelled" : "observed");
