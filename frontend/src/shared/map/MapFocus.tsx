/**
 * Shared map helpers, added by CropTwin. MapFocus moves the map on request (search results, "Locate me", a farm's
 * point). It only moves when target.key changes, so re-renders never move the map. MapClick picks a point by clicking,
 * and PointMarker draws a point.
 */
import type L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "./BoundaryDraw";

/** Where to move the map: a point (with a zoom) or an area. `key` changes for each new request. */
export type FocusTarget =
  | { key: number; point: LatLng; zoom?: number }
  | { key: number; bounds: [LatLng, LatLng] };

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Moves the map when `target` changes (search results, a farm's point, "Locate me"). Render inside the map. */
export function MapFocus({ target }: { target: FocusTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const animate = !still();
    if ("bounds" in target) map.fitBounds(target.bounds, { maxZoom: 16, animate });
    else map.setView(target.point, target.zoom ?? Math.max(map.getZoom(), 14), { animate });
    // Only a new request moves the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key, map]);
  return null;
}

/** Calls `onPick` with the clicked point while `active` (e.g. "pick the farm's point on the map"). */
export function MapClick({ active, onPick }: { active: boolean; onPick: (p: LatLng) => void }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = active ? "crosshair" : "";
    return () => { el.style.cursor = ""; };
  }, [map, active]);
  useMapEvents({
    click: (e: L.LeafletMouseEvent) => {
      const target = e.originalEvent.target as Element | null;
      const onMap = target === map.getContainer() || !!target?.closest?.(".leaflet-pane");
      if (active && onMap) onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/** A point on the map: lime for "you / this farm", with an optional accuracy circle in metres. */
export function PointMarker({ point, accuracyM }: { point: LatLng; accuracyM?: number }) {
  const lime = useMemo(() => token("--color-lime") || "currentColor", []);
  const ground = useMemo(() => token("--color-ground") || "currentColor", []);
  return (
    <>
      {accuracyM !== undefined && (
        <Circle center={point} radius={accuracyM} interactive={false}
          pathOptions={{ color: lime, weight: 1, opacity: 0.6, fillColor: lime, fillOpacity: 0.1 }} />
      )}
      <CircleMarker center={point} radius={7} interactive={false}
        pathOptions={{ color: ground, weight: 2, fillColor: lime, fillOpacity: 1 }} />
    </>
  );
}
