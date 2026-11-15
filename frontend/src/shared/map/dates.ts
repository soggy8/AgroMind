import { formatDate, t } from "../i18n";
/**
 * One way to show dates across the farm profile and map.
 *  - Provider dates (NASA GIBS, POWER, SoilGrids) are calendar days in UTC ("2026-11-10"): shown as "Nov 10, 2026",
 *    with an age counted against today's UTC day ("4 days ago").
 *  - Our own timestamps (created_at, updated_at, retrieved_at) are instants: shown in the user's local time.
 * Nothing here makes up a date; callers pass dates that came from a provider or our database.
 */
const DAY_MS = 86_400_000;

/** Midnight UTC of a "YYYY-MM-DD" day. */
export const dayUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** "Nov 10, 2026" (a calendar day, UTC). */
export const formatDay = (iso: string) =>
  formatDate(new Date(dayUTC(iso)), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Whole days from that UTC day to today's UTC day. */
export function daysAgo(iso: string, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - dayUTC(iso)) / DAY_MS);
}

/** "today", "yesterday", "4 days ago", "3 months ago", "4 years ago". */
export function ageText(days: number): string {
  if (days < 0) return t("in the future");
  if (days === 0) return t("today");
  if (days === 1) return t("yesterday");
  if (days < 60) return t("{days} days ago", { days });
  if (days < 730) return t("{round} months ago", { round: Math.round(days / 30.44) });
  return t("{round} years ago", { round: Math.round(days / 365.25) });
}

/** "Nov 10, 2026 · 4 days ago" */
export const formatDayWithAge = (iso: string, now?: Date) => `${formatDay(iso)} · ${ageText(daysAgo(iso, now))}`;

/** "Nov 14, 2026, 6:12 PM" in the user's local time, for our own timestamps. */
export const formatTimestamp = (instant: string | Date) =>
  formatDate(new Date(instant), { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** "just now", "5 min ago", "3 h ago", or the local date for older instants. */
export function instantAge(instant: string | Date, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(instant).getTime()) / 1000);
  if (s < 60) return t("just now");
  if (s < 3600) return t("{floor} min ago", { floor: Math.floor(s / 60) });
  if (s < 86_400) return t("{n} h ago", { n: Math.floor(s / 3600) });
  return ageText(Math.floor(s / 86_400));
}

/** "Nov 14, 2026, 6:12 PM · 5 min ago" */
export const formatTimestampWithAge = (instant: string | Date, now?: Date) => `${formatTimestamp(instant)} · ${instantAge(instant, now)}`;
