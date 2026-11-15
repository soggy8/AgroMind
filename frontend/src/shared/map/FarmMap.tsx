/**
 * Shared satellite map, rendered by both CropTwin and the Simulator; owned by the shared UI owner.
 * Fills and chip tones (ndviStep, tone) come from CropDoctor. CropTwin's changes:
 *  - an optional `children` prop, so overlays and controls can live inside the map
 *  - an optional `alert` flag on MapField (red outline, used for overlap warnings)
 *  - zoom buttons 44 px on phones (DESIGN.md tap targets), and no map animation under reduced motion
 *  - FitFields' pan-to-selected effect runs only when the selection changes. It used to depend on the `fields` array,
 *    which is new on every render, so it pulled the map back after every search or "Locate me".
 * `startOnGlobe` (landing work): open on a turning 3D globe (GlobeView) that hands over to this map when you
 * zoom in on the farm; zooming this map far out returns to the globe.
 */
import L from "leaflet";
import { Globe2, Minus, Plus } from "lucide-react";
import { lazy, type ReactNode, type RefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useAssistantHighlight, useOptionalAssistant } from "../assistant/AssistantProvider";
import type { GlobeArrival, GlobeTarget } from "./GlobeView";

// MapLibre is large; only load it when a page starts on the globe.
const GlobeView = lazy(() => import("./GlobeView"));
/** Leaflet zoom at or below which the flat map gives way to the globe again. */
const GLOBE_RETURN_ZOOM = 7;
import { NDVI_FILL, type NdviStep } from "../charts/ndvi";
import { useMedia } from "../hooks/useMedia";
import { t } from "../i18n";

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
export function FarmMap({ fields, selectedId, onSelect, center, insets, children, startOnGlobe = false, globeLabel = "the farm" }: {
  fields: MapField[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  center: [number, number];
  insets: MapInsets;
  /** Extra layers or controls rendered inside the map, e.g. BoundaryDraw. */
  children?: ReactNode;
  /** Open on the 3D globe first (no farm chosen, or the demo farm). */
  startOnGlobe?: boolean;
  /** Name on the globe's farm marker and "Fly to" button. */
  globeLabel?: string;
}) {
  const alert = useMemo(() => token("--color-alert") || "currentColor", []);
  // Fields the assistant is talking about pulse (shared/assistant; the class is styled there).
  const pulse = useAssistantHighlight();
  // While the assistant is in use it opens pages to show the farm, so skip the globe intro then.
  const assistantBusy = useOptionalAssistant()?.active ?? false;
  const still = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  // Phones: neighbouring fields' labels collide, so only the selected field is labelled, by name.
  const narrow = useMedia("(max-width: 639px)");

  // Globe stage. `start` null: whole turning globe; otherwise reopen where the flat map was zoomed out.
  const [globe, setGlobe] = useState<{ start: { center: [number, number]; zoom: number } | null; leaving: boolean } | null>(
    startOnGlobe && !assistantBusy ? { start: null, leaving: false } : null);
  const [handoff, setHandoff] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [refit, setRefit] = useState(0);
  const quiet = useRef(false); // true while this component moves the map itself
  const shownAt = useRef(performance.now());
  const fieldKey = fields.map((f) => f.id).join(",");
  const target = useMemo<GlobeTarget | null>(() => {
    const pts = fields.flatMap((f) => f.boundary);
    if (!pts.length) return null;
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    return { label: globeLabel, bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey, globeLabel]);

  const leaveGlobe = useCallback((a?: GlobeArrival) => {
    if (a && !a.toFarm) setHandoff({ center: a.center, zoom: a.zoom });
    if (a?.toFarm) setRefit((n) => n + 1);
    setGlobe((g) => (g ? { ...g, leaving: true } : g));
    window.setTimeout(() => setGlobe(null), still ? 0 : 650);
  }, [still]);
  const backToGlobe = useCallback((c: [number, number], zoom: number) => {
    if (!startOnGlobe) return;
    shownAt.current = performance.now();
    setGlobe({ start: { center: c, zoom }, leaving: false });
  }, [startOnGlobe]);

  return (
    <>
    <MapContainer center={center} zoom={15} zoomControl={false} attributionControl={false} className="absolute inset-0 z-0"
      aria-label={t("Satellite map of the farm")}
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
        const pulsing = pulse.ids.includes(f.id);
        if (pulsing) pathOptions.className = `${pathOptions.className ?? ""} assist-pulse`.trim();
        const showChip = !narrow && f.chip && (selected || greenness);
        const label = !narrow || selected;
        return (
          <Polygon
            key={`${f.id}-${selected}-${!!f.alert}-${greenness ? (step ?? "none") : "plain"}-${pulsing ? pulse.key : ""}`}
            positions={f.boundary}
            pathOptions={pathOptions}
            eventHandlers={{ click: () => onSelect?.(f.id) }}
          >
            {label && (
              <Tooltip key={`${narrow}`} permanent direction="center" className="field-chip" opacity={1}>
                {f.name}
                {showChip && <span style={f.tone ? { color: TONE_COLOR[f.tone] } : undefined}>{f.chip}</span>}
              </Tooltip>
            )}
          </Polygon>
        );
      })}
      <FitFields fields={fields} selectedId={selectedId} insets={insets} refit={refit} quiet={quiet} />
      <ZoomControl insets={insets} onGlobe={startOnGlobe ? backToGlobe : undefined} />
      {startOnGlobe && (
        <GlobeLink active={!!globe && !globe.leaving} handoff={handoff} quiet={quiet} shownAt={shownAt}
          onPageMove={() => leaveGlobe()} onZoomOut={backToGlobe} />
      )}
      {children}
    </MapContainer>
    {globe && (
      <div className={`absolute inset-0 z-[1] bg-ground transition-opacity duration-[600ms] ease-out ${globe.leaving ? "opacity-0" : "opacity-100"}`}>
        <Suspense fallback={null}>
          <GlobeView key={globe.start ? `${globe.start.center.join(",")}-${globe.start.zoom}` : "intro"}
            insets={insets} target={target} fields={fields.map((f) => f.boundary)} start={globe.start} onArrive={leaveGlobe} />
        </Suspense>
      </div>
    )}
    </>
  );
}

/**
 * Keeps the flat map and the globe in step: applies the globe's hand-off view, returns to the globe when the map is
 * zoomed far out, and leaves the globe when the page itself moves the map (a search result, a selected field).
 */
function GlobeLink({ active, handoff, quiet, shownAt, onPageMove, onZoomOut }: {
  active: boolean;
  handoff: { center: [number, number]; zoom: number } | null;
  quiet: RefObject<boolean>;
  shownAt: RefObject<number>;
  onPageMove: () => void;
  onZoomOut: (center: [number, number], zoom: number) => void;
}) {
  const lastSize = useRef<L.Point | null>(null);
  const map = useMapEvents({
    moveend() {
      // A window resize or phone rotation also moves the map; that is not the page asking to show something.
      const size = map.getSize();
      const resized = !!lastSize.current && !size.equals(lastSize.current);
      lastSize.current = size;
      if (resized) return;
      // Pages position the map as they open (fit, focus); only later moves mean "show me this".
      if (active && !quiet.current && performance.now() - shownAt.current > 1500) onPageMove();
    },
    zoomend() {
      if (!active && !quiet.current && map.getZoom() <= GLOBE_RETURN_ZOOM) {
        const c = map.getCenter();
        onZoomOut([c.lat, c.lng], map.getZoom());
      }
    },
  });
  useEffect(() => { lastSize.current = map.getSize(); }, [map]);
  useEffect(() => {
    if (!handoff) return;
    quiet.current = true;
    map.setView(handoff.center, Math.max(handoff.zoom, GLOBE_RETURN_ZOOM + 5), { animate: false });
    quiet.current = false;
  }, [handoff, map, quiet]);
  return null;
}

function FitFields({ fields, selectedId, insets, refit, quiet }: {
  fields: MapField[]; selectedId?: string; insets: MapInsets; refit: number; quiet: RefObject<boolean>;
}) {
  const map = useMap();
  const key = fields.map((f) => f.id).join(",");
  const bounds = useMemo(() => {
    const pts = fields.flatMap((f) => f.boundary);
    return pts.length ? L.latLngBounds(pts) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!bounds) return;
    quiet.current = true;
    map.fitBounds(bounds, {
      paddingTopLeft: [insets.left + 16, insets.top + 56],
      paddingBottomRight: [insets.right + 16, insets.bottom + 48],
      maxZoom: 16,
      animate: false,
    });
    quiet.current = false;
  }, [bounds, map, insets.left, insets.right, insets.top, insets.bottom, refit, quiet]);

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

function ZoomControl({ insets, onGlobe }: { insets: MapInsets; onGlobe?: (center: [number, number], zoom: number) => void }) {
  const map = useMap();
  return (
    <div className="glass absolute z-[500] grid overflow-hidden !rounded-[12px]" style={{ right: insets.right + 16, top: insets.top }}>
      <button type="button" aria-label={t("Zoom in")} onClick={() => map.zoomIn()} className="grid h-[38px] w-[38px] place-items-center max-sm:h-11 max-sm:w-11 text-tx hover:bg-glass-hi">
        <Plus size={16} strokeWidth={1.75} />
      </button>
      <button type="button" aria-label={t("Zoom out")} onClick={() => map.zoomOut()} className="grid h-[38px] w-[38px] place-items-center max-sm:h-11 max-sm:w-11 border-t border-line text-tx hover:bg-glass-hi">
        <Minus size={16} strokeWidth={1.75} />
      </button>
      {onGlobe && (
        <button type="button" aria-label={t("Zoom out to the globe")} title={t("Zoom out to the globe")}
          onClick={() => { const c = map.getCenter(); onGlobe([c.lat, c.lng], Math.min(map.getZoom(), 6)); }}
          className="grid h-[38px] w-[38px] place-items-center border-t border-line text-tx hover:bg-glass-hi max-sm:h-11 max-sm:w-11">
          <Globe2 size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
