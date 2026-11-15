/**
 * Shared map helper, added by CropTwin: the capture date of the Esri satellite imagery under the map centre, shown in
 * the source line. Source and limits are described below.
 */
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { formatDayWithAge } from "./dates";
import { t } from "../i18n";

/**
 * When the satellite imagery under the map centre was captured, from Esri's own metadata.
 *
 * Esri's World Imagery service (the basemap) publishes a "Citations" layer (layer 4 of
 * server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer, capability "Query", read 2026-11-14) with one
 * record per imagery source at a location: SRC_DATE (capture date, yyyymmdd), SRC_RES (metres), SRC_DESC (sensor),
 * NICE_NAME/NICE_DESC (collection and provider) and MinMapLevel/MaxMapLevel (the zoom levels where it is shown).
 * We pick the record shown at the current zoom. Same keyless service and licence as the imagery; CORS is allowed.
 * Asked at most once every 2 seconds, after the map stops moving. Only the map centre is sent.
 */
export interface ImageryCapture {
  date: string | null; // "YYYY-MM-DD", or null when Esri publishes no date here
  resolutionM: number | null;
  source: string | null; // e.g. "Vantor WV02"
}

const CITATIONS = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/4/query";

interface Citation {
  SRC_DATE: number | null;
  SRC_RES: number | null;
  SRC_DESC: string | null;
  NICE_DESC: string | null;
  MinMapLevel: number;
  MaxMapLevel: number;
}

/** The Citations record shown at this zoom for a point (finest resolution wins), as a date, resolution and source. */
export async function imageryCapture(lat: number, lon: number, zoom: number, signal?: AbortSignal): Promise<ImageryCapture> {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: "SRC_DATE,SRC_RES,SRC_DESC,NICE_DESC,MinMapLevel,MaxMapLevel", returnGeometry: "false", f: "json",
  });
  const res = await fetch(`${CITATIONS}?${q}`, { signal });
  if (!res.ok) throw new Error(t("Esri answered {status}.", { status: res.status }));
  const body = await res.json() as { features?: { attributes: Citation }[]; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  const z = Math.round(zoom);
  const shown = (body.features ?? []).map((f) => f.attributes)
    .filter((c) => c.MinMapLevel <= z && z <= c.MaxMapLevel)
    .sort((a, b) => (a.SRC_RES ?? 1e9) - (b.SRC_RES ?? 1e9))[0];
  if (!shown?.SRC_DATE) return { date: null, resolutionM: shown?.SRC_RES ?? null, source: null };
  const d = String(shown.SRC_DATE);
  return {
    date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    resolutionM: shown.SRC_RES,
    source: [shown.NICE_DESC, shown.SRC_DESC].filter(Boolean).join(" ") || null,
  };
}

/** Reports the capture date of the imagery at the map centre (render inside the map). */
export function ImageryDateWatcher({ onChange }: { onChange: (c: ImageryCapture | "error" | null) => void }) {
  const map = useMap();
  const last = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const report = useRef(onChange);
  report.current = onChange;

  useEffect(() => {
    const ask = () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      last.current = Date.now();
      const c = map.getCenter();
      imageryCapture(c.lat, c.lng, map.getZoom(), ctrl.signal)
        .then((r) => report.current(r))
        .catch((e) => { if ((e as Error).name !== "AbortError") report.current("error"); });
    };
    const onMoveEnd = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(ask, Math.max(0, 2000 - (Date.now() - last.current)));
    };
    map.on("moveend", onMoveEnd);
    onMoveEnd();
    return () => {
      map.off("moveend", onMoveEnd);
      window.clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, [map]);
  return null;
}

/**
 * The imagery credit for a map's source line, with the capture date when Esri publishes one (DESIGN.md 8.3):
 * "Imagery © Esri, captured 14 Jul 2025 · 16 months ago (Vantor WV02, 0.5 m)". Every dashboard uses this wording.
 */
export function imageryCredit(imagery: ImageryCapture | "error" | null): string {
  if (imagery === null) return t("Imagery © Esri");
  if (imagery === "error") return t("Imagery © Esri (capture date unavailable right now)");
  if (!imagery.date) return t("Imagery © Esri (capture date not published by Esri here)");
  const extra = [imagery.source, imagery.resolutionM && `${imagery.resolutionM} m`].filter(Boolean).join(", ");
  return t("Imagery © Esri, captured {formatDayWithAge}{v}", { formatDayWithAge: formatDayWithAge(imagery.date), v: extra ? ` (${extra})` : "" });
}
