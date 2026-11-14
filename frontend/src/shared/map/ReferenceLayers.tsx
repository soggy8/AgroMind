// Shared map layer, added by CropTwin: country borders and place names over the imagery (why Esri, not NASA, is below).
import { TileLayer } from "react-leaflet";

/**
 * Country borders and place names over the satellite imagery.
 *
 * NASA GIBS has reference layers (Reference_Features_15m, Reference_Labels_15m), but on 2026-11-14 every tile we
 * fetched was an opaque all-black placeholder (one palette colour, no transparency) and the KVP endpoint answered
 * 500, so they would hide the map. We use Esri's World Boundaries and Places instead: the same server and the same
 * Esri Master License Agreement as the World Imagery basemap, and "designed for use with … World Imagery"
 * (service description). Item a842e359856a4365b1ddf8cc34fde079 (public); not for offline tile export, which we
 * don't do. Attribution is the service's copyrightText. Drawn above imagery and NASA overlays (zIndex in the tile
 * pane) and below field outlines (the overlay pane is above all tiles). See docs/modules/croptwin.md.
 */
export const REFERENCE_ATTRIBUTION =
  "Borders and places: Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community";

const URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export function ReferenceLayers() {
  return <TileLayer url={URL} maxNativeZoom={19} maxZoom={19} zIndex={5} />;
}
