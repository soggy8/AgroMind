/** The greenness (NDVI) scale: the only continuous colour scale (DESIGN.md section 7), in five steps. */
export type NdviStep = 0 | 1 | 2 | 3 | 4;

/** Absolute greenness: < 0.2, < 0.4, < 0.6, < 0.8, else. */
export function ndviStep(ndvi: number): NdviStep {
  if (ndvi < 0.2) return 0;
  if (ndvi < 0.4) return 1;
  if (ndvi < 0.6) return 2;
  if (ndvi < 0.8) return 3;
  return 4;
}

/** Greenness against its normal, in percent: <= -20, <= -10, <= -5, < 5, else. */
export function diffStep(diffPct: number): NdviStep {
  if (diffPct <= -20) return 0;
  if (diffPct <= -10) return 1;
  if (diffPct <= -5) return 2;
  if (diffPct < 5) return 3;
  return 4;
}

// Written out literally so Tailwind generates every class.
export const NDVI_BG: readonly string[] = ["bg-ndvi-0", "bg-ndvi-1", "bg-ndvi-2", "bg-ndvi-3", "bg-ndvi-4"];
export const NDVI_FILL: readonly string[] = ["fill-ndvi-0", "fill-ndvi-1", "fill-ndvi-2", "fill-ndvi-3", "fill-ndvi-4"];
