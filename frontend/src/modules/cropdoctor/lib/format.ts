import type { Value } from "../types";

const minus = "−";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "2012-08-12" -> "12 Aug 2012". */
export const fmtDate = (iso: string) => dateFmt.format(utc(iso));
/** "2012-07-11" -> "11 Jul". */
export const fmtDayMonth = (iso: string) => dayMonthFmt.format(utc(iso));
/** "2012-07-11" -> "Jul". */
export const fmtMonth = (iso: string) => monthFmt.format(utc(iso));

/** Day of the year, 1-based, as the satellite periods count it. */
export function dayOfYear(iso: string): number {
  const d = utc(iso);
  return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}

/** Signed number with a real minus sign: +2.0, −20. */
export function signed(x: number, digits = 0): string {
  const s = Math.abs(x).toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return `${x > 0 ? "+" : minus}${s}`;
}

export const ndvi = (x: number) => x.toFixed(2);

/** A value with its unit: "54 mm", "35.1 °C", "6.4 mm/day", NDVI "0.76". */
export function fmtValue(v: Value): string {
  if (v.value === null) return "–";
  if (v.unit === "") return ndvi(v.value);
  if (v.unit === "mm") return `${Math.round(v.value)} mm`;
  return `${v.value.toFixed(1)} ${v.unit === "mm/day" ? "mm/d" : v.unit}`;
}

/** "−8%", "+5.2 °C", or with `vsNormal` "−8% vs normal"; undefined when there is no comparison. */
export function fmtDiff(v: Value, vsNormal = false): string | undefined {
  if (v.diff === null || v.diff_unit === null) return undefined;
  const d = v.diff_unit === "%" ? `${signed(v.diff)}%` : `${signed(v.diff, 1)} ${v.diff_unit}`;
  return vsNormal ? `${d} vs normal` : d;
}

/** value / normal for the vs-normal bar, or null. */
export const ratio = (v: Value) => (v.value !== null && v.normal ? v.value / v.normal : null);

/** "silt_loam" -> "Silt loam". */
export function fmtTexture(id: string): string {
  const s = id.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** The short name of a source for a meta line: text before the first " (", ", " or " from ". */
export function shortSource(source: string): string {
  const cut = source.search(/ \(|, | from /);
  return cut > 0 ? source.slice(0, cut) : source;
}

export const fmtArea = (ha: number) => `${ha.toFixed(1)} ha`;
