/**
 * Shared satellite map, rendered by both CropTwin and the Simulator; owned by the shared UI owner.
 * Fills and chip tones (ndviStep, tone) come from CropDoctor. CropTwin's changes:
 *  - an optional `children` prop, so overlays and controls can live inside the map
 *  - an optional `alert` flag on MapField (red outline, used for overlap warnings)
 *  - zoom buttons 44 px on phones (DESIGN.md tap targets), and no map animation under reduced motion
 *  - FitFields' pan-to-selected effect runs only when the selection changes. It used to depend on the `fields` array,
 *    which is new on every render, so it pulled the map back after every search or "Locate me".
 */
import L from "leaflet";
import { Minus, Plus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";
import { NDVI_FILL, type NdviStep } from "../charts/ndvi";

export interface MapField {
  id: string;
  name: string;
  boundary: [number, number][];
  chip?: string; // secondary text, shown in the selected field's chip
  /**
   * Greenness step. A number fills the field with that NDVI colour; null means greenness is known
   * to be off or missing. With either set (or `tone`), every field shows its chip value and a solid
   * outline. Leave both unset for the plain outline map.
   */
  ndviStep?: NdviStep | null;
  tone?: "ok" | "watch" | "alert"; // colours the chip's value
  alert?: boolean; // outlined in the alert colour, e.g. a field the boundary being drawn overlaps
}

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Inline colour: the chip's span colour is set by unlayered CSS in index.css, which beats utilities.
const TONE_COLOR = { ok: "var(--color-ok)", watch: "var(--color-watch)", alert: "var(--color-alert)" } as const;

// Leaflet paths take a colour string, not a CSS variable; this is the token-free outline white.
const WHITE = "#ffffff";
const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** Padding (px) that keeps fitted fields clear of the floating panels. */
export interface MapInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Full-bleed satellite map with the farm's fields (DESIGN.md sections 5 and 6).
 * Fields are white outlines; the selected one is thicker. The simulator never recolours fields:
 * fills on this map mean observed greenness, which belongs to CropDoctor.
 */
export function FarmMap({ fields, selectedId, onSelect, center, insets, children }: {
  fields: MapField[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  center: [number, number];
  insets: MapInsets;
  /** Extra layers or controls rendered inside the map, e.g. BoundaryDraw. */
  children?: ReactNode;
}) {
  const alert = useMemo(() => token("--color-alert") || "currentColor", []);
  const still = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  return (
    <MapContainer center={center} zoom={15} zoomControl={false} attributionControl={false} className="absolute inset-0 z-0"
      aria-label="Satellite map of the farm"
      // DESIGN.md section 8: no animated map moves when the user prefers reduced motion.
      zoomAnimation={!still} fadeAnimation={!still} markerZoomAnimation={!still}>
      <TileLayer url={ESRI_IMAGERY} maxZoom={19} maxNativeZoom={18} />
      {fields.map((f) => {
        const selected = f.id === selectedId;
        const greenness = f.ndviStep !== undefined || f.tone !== undefined;
        const step = typeof f.ndviStep === "number" ? f.ndviStep : null;
        const pathOptions: L.PathOptions = f.alert
          ? { color: alert, weight: 3, opacity: 1, fillColor: alert, fillOpacity: 0.18 }
          : greenness
          ? {
              color: WHITE,
              weight: selected ? 2.5 : 2,
              opacity: 1,
              fillColor: WHITE,
              fillOpacity: step !== null ? 0.75 : selected ? 0.14 : 0.04,
              // Leaflet applies a class only when the path is created, so the step is in the key.
              className: step !== null ? NDVI_FILL[step] : undefined,
            }
          : {
              color: WHITE,
              weight: selected ? 2.5 : 1.5,
              opacity: selected ? 1 : 0.7,
              fillColor: WHITE,
              fillOpacity: selected ? 0.14 : 0.04,
              dashArray: selected ? undefined : "6 6",
            };
        const showChip = f.chip && (selected || greenness);
        return (
          <Polygon
            key={`${f.id}-${selected}-${!!f.alert}-${greenness ? (step ?? "none") : "plain"}`}
            positions={f.boundary}
            pathOptions={pathOptions}
            eventHandlers={{ click: () => onSelect?.(f.id) }}
          >
            <Tooltip permanent direction="center" className="field-chip" opacity={1}>
              {f.name}
              {showChip && <span style={f.tone ? { color: TONE_COLOR[f.tone] } : undefined}>{f.chip}</span>}
            </Tooltip>
          </Polygon>
        );
      })}
      <FitFields fields={fields} selectedId={selectedId} insets={insets} />
      <ZoomControl insets={insets} />
      {children}
    </MapContainer>
  );
}

function FitFields({ fields, selectedId, insets }: { fields: MapField[]; selectedId?: string; insets: MapInsets }) {
  const map = useMap();
  const key = fields.map((f) => f.id).join(",");
  const bounds = useMemo(() => {
    const pts = fields.flatMap((f) => f.boundary);
    return pts.length ? L.latLngBounds(pts) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, {
      paddingTopLeft: [insets.left + 16, insets.top + 56],
      paddingBottomRight: [insets.right + 16, insets.bottom + 48],
      maxZoom: 16,
      animate: false,
    });
  }, [bounds, map, insets.left, insets.right, insets.top, insets.bottom]);

  // Bring a newly selected field into view. This must run only when the selection changes: `fields` is a new
  // array on every parent render, and any map move re-renders the page (e.g. the imagery-date lookup), so
  // depending on it would pull the map back to the field after every search or "Locate me".
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  useEffect(() => {
    const f = fieldsRef.current.find((x) => x.id === selectedId);
    if (!f) return;
    const fb = L.latLngBounds(f.boundary);
    if (!map.getBounds().contains(fb)) map.panInsideBounds(fb, { animate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, [selectedId, map]);
  return null;
}

function ZoomControl({ insets }: { insets: MapInsets }) {
  const map = useMap();
  return (
    <div className="glass absolute z-[500] grid overflow-hidden !rounded-[12px]" style={{ right: insets.right + 16, top: insets.top }}>
      <button type="button" aria-label="Zoom in" onClick={() => map.zoomIn()} className="grid h-[38px] w-[38px] place-items-center max-sm:h-11 max-sm:w-11 text-tx hover:bg-glass-hi">
        <Plus size={16} strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Zoom out" onClick={() => map.zoomOut()} className="grid h-[38px] w-[38px] place-items-center max-sm:h-11 max-sm:w-11 border-t border-line text-tx hover:bg-glass-hi">
        <Minus size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
