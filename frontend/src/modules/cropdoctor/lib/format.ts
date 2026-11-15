import type { Units } from "../../../shared/units";
import type { Value } from "../types";
import { formatDate, t } from "../../../shared/i18n";

const minus = "−";

const dateFmt = { format: (d: Date) => formatDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) };
const dayMonthFmt = { format: (d: Date) => formatDate(d, { day: "numeric", month: "short", timeZone: "UTC" }) };
const monthFmt = { format: (d: Date) => formatDate(d, { month: "short", timeZone: "UTC" }) };

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

/**
 * A value with its unit: "54 mm", "35.1 °C", "6.4 mm/d", NDVI "0.76". With `u` (the shared Metric/US setting) water
 * and temperature follow the user's units: "2.1 in", "95.1 °F", "0.25 in/d". The API always speaks metric.
 */
export function fmtValue(v: Value, u?: Units): string {
  if (v.value === null) return "–";
  if (v.unit === "") return ndvi(v.value);
  if (v.unit === "mm") return u ? u.water(v.value) : `${Math.round(v.value)} mm`;
  if (v.unit === "°C" && u) return u.temp(v.value);
  if (v.unit === "mm/day") return u?.system === "us" ? `${(v.value / 25.4).toFixed(2)} in/d` : `${v.value.toFixed(1)} mm/d`;
  return `${v.value.toFixed(1)} ${v.unit}`;
}

/** "−8%", "+5.2 °C" (or "+9.4 °F" with US units), or with `vsNormal` "−8% vs normal"; undefined when there is no comparison. */
export function fmtDiff(v: Value, vsNormal = false, u?: Units): string | undefined {
  if (v.diff === null || v.diff_unit === null) return undefined;
  const d = v.diff_unit === "%" ? `${signed(v.diff)}%` : u && v.diff_unit === "°C" ? u.tempDelta(v.diff) : `${signed(v.diff, 1)} ${v.diff_unit}`;
  return vsNormal ? t("{d} vs normal", { d }) : d;
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

export const fmtArea = (ha: number, u?: Units) => (u ? u.area(ha) : `${ha.toFixed(1)} ha`);
