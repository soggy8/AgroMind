/**
 * Shared map helper, added by CropTwin: one request to the browser's Geolocation API, plus plain messages for when it
 * fails. Privacy: callers keep the result in memory only (see requestLocation below).
 */
import type { LatLng } from "./BoundaryDraw";
import { t } from "../i18n";

export interface UserLocation {
  point: LatLng;
  /** Radius of the browser's 95% confidence circle, in metres (Geolocation API `coords.accuracy`). */
  accuracyM: number;
}

export type LocationProblem = "denied" | "unavailable" | "unsupported";

/**
 * The user's location from the browser's Geolocation API, one request. It stays in the browser: callers use it
 * to centre the map and never send or store it (a farm saved "at my location" is the user's explicit choice).
 */
export function requestLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject("unsupported" satisfies LocationProblem);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ point: [p.coords.latitude, p.coords.longitude], accuracyM: p.coords.accuracy }),
      (e) => reject((e.code === e.PERMISSION_DENIED ? "denied" : "unavailable") satisfies LocationProblem),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

export const locationProblemText: Record<LocationProblem, string> = {
  denied: t("Location is blocked for this site. Allow it in the browser's site settings, or search for your area."),
  unavailable: t("Your location couldn't be found right now. Try again, or search for your area."),
  unsupported: t("This browser can't share a location. Search for your area instead."),
};
