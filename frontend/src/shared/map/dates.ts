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
  new Date(dayUTC(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Whole days from that UTC day to today's UTC day. */
export function daysAgo(iso: string, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - dayUTC(iso)) / DAY_MS);
}

/** "today", "yesterday", "4 days ago", "3 months ago", "4 years ago". */
export function ageText(days: number): string {
  if (days < 0) return "in the future";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30.44)} months ago`;
  return `${Math.round(days / 365.25)} years ago`;
}

/** "Nov 10, 2026 · 4 days ago" */
export const formatDayWithAge = (iso: string, now?: Date) => `${formatDay(iso)} · ${ageText(daysAgo(iso, now))}`;

/** "Nov 14, 2026, 6:12 PM" in the user's local time, for our own timestamps. */
export const formatTimestamp = (instant: string | Date) =>
  new Date(instant).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** "just now", "5 min ago", "3 h ago", or the local date for older instants. */
export function instantAge(instant: string | Date, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(instant).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return ageText(Math.floor(s / 86_400));
}

/** "Nov 14, 2026, 6:12 PM · 5 min ago" */
export const formatTimestampWithAge = (instant: string | Date, now?: Date) => `${formatTimestamp(instant)} · ${instantAge(instant, now)}`;
