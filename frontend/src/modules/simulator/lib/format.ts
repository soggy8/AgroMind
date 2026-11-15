import type { Scenario, Stat } from "../types";
import { t, tn } from "../../../shared/i18n";

const minus = "−";

/** Signed number with a real minus sign: +2.0, −20. */
export function signed(x: number, digits = 0): string {
  const s = Math.abs(x).toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return `${x > 0 ? "+" : minus}${s}`;
}

export const pct = (share: number, digits = 0) => `${(share * 100).toFixed(digits)}%`;

/** "87–99%" for a share-valued Stat's p10–p90. */
export const pctRange = (s: Stat) => `${(s.p10 * 100).toFixed(0)}–${pct(s.p90)}`;

export const mm = (x: number) => `${Math.round(x)} mm`;

export function usd(x: number): string {
  const v = Math.round(x);
  return `${v < 0 ? minus : ""}$${Math.abs(v).toLocaleString("en-US")}`;
}

export function scenarioSummary(s: Scenario): string[] {
  const parts = [`${signed(s.temp_delta_c, 1)} °C`, t("{v}% rain", { v: signed(s.rain_change_pct) })];
  parts.push(s.irrigation === "none" ? t("rain-fed") : s.irrigation === "full" ? t("full irrigation") : t("irrigation ≤ {v} mm", { v: s.irrigation_cap_mm ?? 0 }));
  parts.push(tn(s.years, "{n} year", "{n} years"));
  return parts;
}

/** True when the scenario leaves the weather unchanged (no sliders moved and no NASA projection). */
export const isTodayClimate = (s: Scenario) => !s.projection && s.temp_delta_c === 0 && s.rain_change_pct === 0;
