/**
 * Shared map code, added by CropTwin (other modules may reuse it). Field boundary drawing for react-leaflet, plus the
 * pure geometry checks selfIntersects() and overlaps(), which copy backend croptwin/geometry.py. Keep the two copies
 * in step, so the UI warns about exactly what the API rejects.
 */
import L from "leaflet";
import { AlertTriangle, Check, Crosshair, RotateCcw, Undo2, X } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { Marker, Polygon, Polyline, useMap, useMapEvents } from "react-leaflet";
import { t as tr } from "../i18n";

/** (latitude, longitude), the order Leaflet uses. */
export type LatLng = [number, number];

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * True if two non-adjacent edges of the closed ring cross. Same test as
 * backend/app/modules/croptwin/geometry.py `_self_intersects`, so the warning matches what the API rejects.
 */
export function selfIntersects(ring: LatLng[]): boolean {
  const orient = (a: LatLng, b: LatLng, c: LatLng) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const edges = ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as const);
  const n = edges.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // first and last edges share the closing corner
      const [p1, p2] = edges[i];
      const [q1, q2] = edges[j];
      if (orient(q1, q2, p1) * orient(q1, q2, p2) < 0 && orient(p1, p2, q1) * orient(p1, p2, q2) < 0) return true;
    }
  }
  return false;
}

const orient = (a: LatLng, b: LatLng, c: LatLng) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const edgesOf = (ring: LatLng[]) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as const);
const properlyCross = ([p1, p2]: readonly [LatLng, LatLng], [q1, q2]: readonly [LatLng, LatLng]) =>
  orient(q1, q2, p1) * orient(q1, q2, p2) < 0 && orient(p1, p2, q1) * orient(p1, p2, q2) < 0;
const onSegment = (p: LatLng, a: LatLng, b: LatLng) => orient(a, b, p) === 0
  && Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);

/** Ray casting; points on the outline count as outside. */
function strictlyInside(p: LatLng, ring: LatLng[]): boolean {
  const edges = edgesOf(ring);
  if (edges.some(([a, b]) => onSegment(p, a, b))) return false;
  let inside = false;
  for (const [[x0, y0], [x1, y1]] of edges) {
    if ((y0 > p[1]) !== (y1 > p[1]) && p[0] < x0 + ((p[1] - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
  }
  return inside;
}

/**
 * True if two outlines share area; touching along an edge or at a corner doesn't count (a shared fence line).
 * Same test as backend/app/modules/croptwin/geometry.py `overlaps`, so the warning matches what the API rejects.
 */
export function overlaps(a: LatLng[], b: LatLng[]): boolean {
  const key = (r: LatLng[]) => r.map((p) => p.join(",")).sort().join(";");
  if (a.length === b.length && key(a) === key(b)) return true;
  const ea = edgesOf(a), eb = edgesOf(b);
  if (ea.some((e) => eb.some((f) => properlyCross(e, f)))) return true;
  const mid = ([p, q]: readonly [LatLng, LatLng]): LatLng => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  return [...a, ...ea.map(mid)].some((p) => strictlyInside(p, b)) || [...b, ...eb.map(mid)].some((p) => strictlyInside(p, a));
}

/** "A", "A and B", "A, B and C". */
export const listNames = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function vertexIcon(first: boolean, canClose: boolean) {
  const size = first && canClose ? 16 : 12;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;box-sizing:border-box;`
      + `background:var(--color-lime);border:2px solid var(--color-ground);cursor:pointer"></span>`,
  });
}

/** Keys typed into a control belong to that control, not to the drawing shortcuts. */
const isControl = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName));

/**
 * Field boundary editor for a react-leaflet map (DESIGN.md sections 5, 6 and 8). Render it as a child
 * of the map. While the shape is open, clicking the map (or "Add corner" at the crosshair, for keyboard
 * use: arrow keys pan a focused map) adds a corner; clicking the first corner, "Close shape" or Enter
 * closes it; Backspace undoes a corner; Escape cancels. Once closed, corners can be dragged and
 * "Redraw" starts over. A warning shows if the outline's edges cross. Lime marks the shape being edited.
 * Keyboard users who can't drag should also get a typed-coordinates fallback next to the map.
 */
export function BoundaryDraw({ points, closed, onChange, onDone, onCancel, toolbarStyle, overlapping = [] }: {
  points: LatLng[];
  closed: boolean;
  onChange: (points: LatLng[], closed: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
  /** Where the toolbar sits over the map, e.g. clear of the floating panels and the zoom buttons. */
  toolbarStyle?: CSSProperties;
  /** Names of other fields this outline shares area with, for the warning. The caller works them out. */
  overlapping?: string[];
}) {
  const map = useMap();
  const lime = useMemo(() => token("--color-lime") || "currentColor", []);
  const toolbar = useRef<HTMLDivElement>(null);
  const canClose = points.length >= 3;
  const crossing = closed && canClose && selfIntersects(points);

  useEffect(() => {
    if (!toolbar.current) return;
    L.DomEvent.disableClickPropagation(toolbar.current);
    L.DomEvent.disableScrollPropagation(toolbar.current);
  }, []);

  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = closed ? "" : "crosshair";
    if (!closed) map.doubleClickZoom.disable(); // quick corner clicks shouldn't zoom
    return () => {
      el.style.cursor = "";
      map.doubleClickZoom.enable();
    };
  }, [map, closed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isControl(e.target)) return;
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter" && !closed && canClose) onChange(points, true);
      else if (e.key === "Backspace" && !closed && points.length) onChange(points.slice(0, -1), false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points, closed, canClose, onChange, onCancel]);

  useMapEvents({
    click: (e) => {
      // Only clicks on the map itself (the container background, where tile clicks land, or a layer in a
      // pane); other controls inside the container, like the zoom buttons, aren't corners.
      const target = e.originalEvent.target as Element | null;
      const onMap = target === map.getContainer() || !!target?.closest?.(".leaflet-pane");
      if (!closed && onMap) onChange([...points, [e.latlng.lat, e.latlng.lng]], false);
    },
  });

  const addAtCentre = () => {
    const c = map.getCenter();
    onChange([...points, [c.lat, c.lng]], false);
  };
  const moveVertex = (i: number, ll: L.LatLng) =>
    onChange(points.map((p, j) => (j === i ? [ll.lat, ll.lng] : p)), closed);

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-ctl border border-line bg-glass-hi px-2.5 text-[13px] font-semibold "
    + "text-tx hover:bg-glass-sel disabled:cursor-not-allowed disabled:opacity-50 max-sm:h-11";

  return (
    <>
      {closed && canClose ? (
        <Polygon positions={points} pathOptions={{ color: lime, weight: 2.5, fillColor: lime, fillOpacity: 0.12 }}
          interactive={false} />
      ) : (
        points.length > 1 && <Polyline positions={points} pathOptions={{ color: lime, weight: 2.5, dashArray: "6 5" }}
          interactive={false} />
      )}
      {points.map((p, i) => (
        <Marker key={i} position={p} icon={vertexIcon(i === 0, canClose && !closed)} draggable={closed}
          keyboard={false} title={i === 0 && !closed && canClose ? tr("Close the shape") : tr("Corner {v}", { v: i + 1 })}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              if (i === 0 && !closed && canClose) onChange(points, true);
            },
            dragend: (e) => moveVertex(i, (e.target as L.Marker).getLatLng()),
          }} />
      ))}

      {!closed && (
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[450] -translate-x-1/2 -translate-y-1/2 text-tx opacity-80">
          <Crosshair size={22} strokeWidth={1.75} />
        </div>
      )}

      <div ref={toolbar} role="toolbar" aria-label={tr("Boundary drawing")}
        className="glass absolute z-[500] max-w-[calc(100%-32px)] !rounded-[14px] p-1.5"
        style={toolbarStyle ?? { left: 16, top: 16 }}>
        {/* Buttons on their own row, first, so they never shift when the status text below changes length. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {closed ? (
            <>
              <button type="button" className={btn} onClick={onDone}>
                <Check size={15} strokeWidth={1.75} /> {tr("Done")}
              </button>
              <button type="button" className={btn} onClick={() => onChange([], false)}>
                <RotateCcw size={15} strokeWidth={1.75} /> {tr("Redraw")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={btn} onClick={() => onChange(points, true)} disabled={!canClose}>
                <Check size={15} strokeWidth={1.75} /> {tr("Close shape")}
              </button>
              <button type="button" className={btn} onClick={() => onChange(points.slice(0, -1), false)} disabled={!points.length}>
                <Undo2 size={15} strokeWidth={1.75} /> {tr("Undo")}
              </button>
              <button type="button" className={btn} onClick={addAtCentre} title={tr("Add a corner at the crosshair")}>
                <Crosshair size={15} strokeWidth={1.75} /> {tr("Add corner")}
              </button>
            </>
          )}
          <button type="button" className={btn} onClick={onCancel}>
            <X size={15} strokeWidth={1.75} /> {tr("Cancel")}
          </button>
        </div>
        <div className="px-1.5 pb-0.5 pt-1.5" aria-live="polite">
          <span className="block text-[13px] font-semibold">
            {closed
              ? tr("Drag the corners to adjust")
              : points.length === 0
                ? tr("Click the map to place the first corner")
                : (points.length === 1 ? tr("{n} corner", { n: 1 }) : tr("{n} corners", { n: points.length })) + (canClose ? tr(" · click the first one to close") : "")}
          </span>
          <span className="block text-[12px] text-mut">
            {closed ? tr("Esc to cancel") : tr("Enter to close · Backspace to undo · Esc to cancel")}
          </span>
          {crossing && (
            <span role="alert" className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-alert">
              <AlertTriangle size={13} strokeWidth={2} /> {tr("Edges cross. Drag a corner or redraw.")}
            </span>
          )}
          {overlapping.length > 0 && (
            <span role="alert" className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-alert">
              <AlertTriangle size={13} strokeWidth={2} className="shrink-0" /> {tr("Overlaps {listNames}. Fields can share an edge, not area.", { listNames: listNames(overlapping) })}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
