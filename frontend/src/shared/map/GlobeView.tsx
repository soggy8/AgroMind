import { Hand, Navigation } from "lucide-react";
import { type LngLatBoundsLike, Map as GlobeMap, Marker, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre finds its worker relative to its own file, which Vite's dependency bundling moves. The worker is a
// single self-contained module, so hand Vite its URL directly (works in dev and in the build).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);
import { useEffect, useRef, useState } from "react";
import type { MapInsets } from "./FarmMap";
import { t } from "../i18n";

/**
 * Google Earth-style entry to a farm map: a turning 3D globe of Esri World Imagery that you can drag and zoom
 * from orbit down to field level (MapLibre GL globe projection). It spins slowly until you touch it.
 * Zooming in on the farm, or pressing "Fly to", hands over to the 2D farm map (`onArrive`).
 * Loaded lazily by FarmMap; nothing else imports it.
 */
export interface GlobeTarget {
  label: string;
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
}

export interface GlobeArrival {
  center: [number, number]; // [lat, lon], Leaflet order
  zoom: number; // Leaflet zoom (256 px tiles)
  toFarm: boolean;
}

const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SECONDS_PER_TURN = 120;
/** MapLibre zoom at which the globe hands over to the farm map (Leaflet zoom is one higher). */
const ARRIVE_ZOOM = 12.5;
const FARM_ZOOM = 14.5;

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function GlobeView({ insets, target, fields, start, onArrive }: {
  insets: MapInsets;
  target: GlobeTarget | null;
  fields: [number, number][][]; // rings, [lat, lon]
  /** Where to open. Without it: the whole globe, turning, with the farm coming round. */
  start: { center: [number, number]; zoom: number } | null; // [lat, lon], Leaflet zoom
  onArrive: (a: GlobeArrival) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GlobeMap | null>(null);
  const flyingToFarm = useRef(false);
  const [touched, setTouched] = useState(!!start);
  const [failed, setFailed] = useState(false);
  const [compact, setCompact] = useState(false); // small map box (phones): smaller button, no hint
  const arrive = useRef(onArrive);
  arrive.current = onArrive;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = el.clientHeight < 560;
    setCompact(small);
    // Leave room under the globe for the "Fly to" button (and the hint on larger maps).
    const padding = { left: insets.left, right: insets.right, top: insets.top + (small ? 52 : 40), bottom: insets.bottom + (small ? 44 : 150) };
    const free = Math.max(160, Math.min(el.clientWidth - padding.left - padding.right, el.clientHeight - padding.top - padding.bottom));
    // Globe diameter is about 512 * 2^zoom / pi pixels; fill most of the free space.
    const wholeGlobeZoom = Math.min(2.6, Math.max(0.2, Math.log2((0.86 * free * Math.PI) / 512)));
    const farmLon = target ? (target.bbox[0] + target.bbox[2]) / 2 : 0;
    const farmLat = target ? (target.bbox[1] + target.bbox[3]) / 2 : 20;

    const ground = token("--color-ground") || "black";
    const style: StyleSpecification = {
      version: 8,
      projection: { type: "globe" },
      sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0] },
      sources: {
        imagery: { type: "raster", tiles: [ESRI_IMAGERY], tileSize: 256, maxzoom: 19 },
        fields: {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: fields.filter((r) => r.length >= 3).map((ring) => ({
              type: "Feature", properties: {},
              geometry: { type: "Polygon", coordinates: [[...ring, ring[0]].map(([lat, lon]) => [lon, lat])] },
            })),
          },
        },
      },
      layers: [
        { id: "space", type: "background", paint: { "background-color": ground } },
        { id: "imagery", type: "raster", source: "imagery" },
        // Leaflet-style outline white; MapLibre paint needs a colour string, not a CSS variable.
        { id: "fields", type: "line", source: "fields", minzoom: 9, paint: { "line-color": "#ffffff", "line-width": 2 } },
      ],
    };

    let map: GlobeMap;
    try {
      map = new GlobeMap({
        container: el,
        style,
        center: start ? [start.center[1], start.center[0]] : [farmLon + 55, Math.max(-50, Math.min(50, farmLat - 12))],
        zoom: start ? start.zoom - 1 : wholeGlobeZoom,
        attributionControl: false,
        maxZoom: 18,
        maxPitch: 60,
      });
    } catch {
      setFailed(true); // No WebGL: FarmMap falls back to the flat map.
      return;
    }
    mapRef.current = map;
    map.setPadding(padding);

    if (target) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "globe-farm-marker";
      dot.setAttribute("aria-label", t("{label} on the globe: fly there", { label: target.label }));
      dot.innerHTML = `<i></i><span></span>`;
      dot.querySelector("span")!.textContent = target.label;
      dot.addEventListener("click", (e) => { e.stopPropagation(); flyToFarm(); });
      new Marker({ element: dot, anchor: "left", offset: [-7, 0] })
        .setLngLat([farmLon, farmLat]).addTo(map);
    }

    // Spin until the user takes over (MapLibre "rotating globe" pattern).
    let spinning = !start && !still;
    const spin = () => {
      if (!spinning || map.getZoom() > 4) return;
      const c = map.getCenter();
      map.easeTo({ center: [c.lng - 360 / SECONDS_PER_TURN, c.lat], duration: 1000, easing: (n) => n });
    };
    const stopSpin = () => {
      if (!spinning) return;
      spinning = false;
      map.stop();
      setTouched(true);
    };
    map.on("mousedown", stopSpin);
    map.on("touchstart", stopSpin);
    map.on("wheel", stopSpin);
    map.on("load", spin);

    // "Over the farm", with slack: zooming a globe around the pointer drifts (tens of km on the way down from
    // orbit), so the farm can sit past the edge by the time the threshold is crossed.
    const inView = () => {
      if (!target) return true;
      const b = map.getBounds();
      const slack = Math.max(0.3, 0.5 * (b.getNorth() - b.getSouth())); // about 30 km
      const [w, s, e, n] = target.bbox;
      return !(e + slack < b.getWest() || w - slack > b.getEast() || n + slack < b.getSouth() || s - slack > b.getNorth());
    };
    let arrived = false;
    const handOver = (toFarm: boolean) => {
      if (arrived) return;
      arrived = true;
      // Over a farm, land on the whole farm as the dashboard frames it; with no farm yet, keep the exact view.
      const c = map.getCenter();
      arrive.current({ center: [c.lat, c.lng], zoom: Math.round(map.getZoom() + 1), toFarm: toFarm || !!target });
    };
    // Hand over as soon as a zoom crosses the threshold over the farm, so the rest of a scroll lands on the farm map.
    map.on("zoom", () => {
      if (!spinning && !flyingToFarm.current && map.getZoom() >= ARRIVE_ZOOM && inView()) handOver(false);
    });
    map.on("moveend", () => {
      if (spinning) return spin();
      if (flyingToFarm.current) handOver(true);
      else if (map.getZoom() >= ARRIVE_ZOOM && inView()) handOver(false);
    });

    function flyToFarm() {
      if (!target) return;
      spinning = false;
      setTouched(true);
      flyingToFarm.current = true;
      const bounds: LngLatBoundsLike = [[target.bbox[0], target.bbox[1]], [target.bbox[2], target.bbox[3]]];
      const cam = map.cameraForBounds(bounds, { padding: 30, maxZoom: FARM_ZOOM }) ?? { center: [farmLon, farmLat], zoom: FARM_ZOOM };
      map.stop();
      if (still) map.jumpTo({ ...cam, bearing: 0, pitch: 0 });
      else map.flyTo({ ...cam, bearing: 0, pitch: 0, duration: 4200, curve: 1.6, essential: true });
    }
    (el as HTMLDivElement & { flyToFarm?: () => void }).flyToFarm = flyToFarm;

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // The globe is created once per showing; FarmMap remounts it for a new start view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (failed) arrive.current({ center: [0, 0], zoom: 0, toFarm: true }); }, [failed]);

  const fly = () => (host.current as (HTMLDivElement & { flyToFarm?: () => void }) | null)?.flyToFarm?.();

  return (
    <div className="absolute inset-0">
      {/* Inline position: maplibre-gl.css sets .maplibregl-map to relative, which beats utility classes. */}
      <div ref={host} style={{ position: "absolute", inset: 0 }} aria-label={t("3D globe. Drag to turn it, scroll or pinch to zoom.")} role="application" />
      {/* Small maps (phones) keep their bottom corners for page pills, so the button goes top right there. */}
      <div className={`pointer-events-none absolute z-10 flex flex-col gap-2 ${compact ? "items-end" : "inset-x-0 items-center px-4"}`}
        style={compact ? { top: insets.top + 8, right: insets.right + 8 } : { bottom: insets.bottom + 104 }}>
        {target && (
          <button type="button" onClick={fly}
            // Small maps share the screen with the page's own primary button, so the button is glass there.
            className={`pointer-events-auto inline-flex items-center gap-2 ${compact
              ? "glass !rounded-ctl px-3 py-2 text-[13px] font-semibold hover:bg-glass-sel" : "btn-primary px-4 py-2.5 text-sm"}`}>
            <Navigation size={15} strokeWidth={2} /> {t("Fly to")} {t(target.label)}
          </button>
        )}
        {!touched && !compact && (
          <p className="glass inline-flex items-center gap-2 !rounded-chip px-3 py-1.5 text-[12.5px] font-medium text-mut">
            <Hand size={14} strokeWidth={1.75} /> {t("Drag to turn the globe · scroll or pinch to zoom in")}{target ? "" : t(" on your farm")}
          </p>
        )}
      </div>
    </div>
  );
}
