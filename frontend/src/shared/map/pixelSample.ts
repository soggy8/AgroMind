/**
 * Shared map helper, added by CropTwin: reads the exact colour NASA GIBS drew at a point, in the browser. Used for the
 * value readout and the "nothing drawn here" check in NasaLayerControl.
 */
import type { LatLng } from "./BoundaryDraw";
import { tileUrl } from "./gibs";
import type { NasaLayer } from "./nasaLayers";
import { t } from "../i18n";

export interface PixelColour { r: number; g: number; b: number; a: number }

/** Web Mercator tile and pixel for a point at zoom `z` (256 px tiles, as GIBS GoogleMapsCompatible uses). */
export function tilePixel([lat, lon]: LatLng, z: number) {
  const scale = 256 * 2 ** z;
  const x = ((lon + 180) / 360) * scale;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return { col: Math.floor(x / 256), row: Math.floor(y / 256), px: Math.floor(x) % 256, py: Math.floor(y) % 256 };
}

/**
 * The exact colour NASA drew at `point`, read from the GIBS tile at the layer's native zoom (no scaling, so no
 * blended colours). GIBS tiles send `Access-Control-Allow-Origin: *`, so the browser may read their pixels.
 * Rejects with a plain message when the tile can't be read (e.g. no data for that date: GIBS answers 404).
 */
export async function samplePixel(layer: NasaLayer, date: string, point: LatLng, signal?: AbortSignal): Promise<PixelColour> {
  const g = layer.gibs;
  if (!g) throw new Error(t("This layer has no NASA map tiles to read."));
  const { col, row, px, py } = tilePixel(point, g.maxNativeZoom);
  const url = tileUrl(g, date).replace("{z}", String(g.maxNativeZoom)).replace("{y}", String(row)).replace("{x}", String(col));
  const res = await fetch(url, { signal, mode: "cors" });
  if (!res.ok) throw new Error(res.status === 404 ? t("NASA has no tile here for that date.") : t("NASA GIBS answered {status}.", { status: res.status }));
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(t("This browser can't read map pixels."));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0);
  const [r, g2, b, a] = ctx.getImageData(px, py, 1, 1).data;
  return { r, g: g2, b, a };
}
