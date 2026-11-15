/**
 * NASA GIBS helpers: available dates (live, from WMTS DescribeDomains), tile URLs, and links to
 * NASA Worldview and Earthdata Search. Endpoints and URL parameters:
 *  - tiles: the ResourceURL template in the GIBS WMTS capabilities (REST, EPSG:3857, "best")
 *  - dates: GIBS WMTS DescribeDomains, which answers with CORS headers
 *  - Worldview: doc/url_parameters.md in github.com/nasa-gibs/worldview (`v`, `l`, `t`)
 */
import type { NasaLayer } from "./nasaLayers";
import { t as tr } from "../i18n";

const WMTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

type Gibs = NonNullable<NasaLayer["gibs"]>;

/** One run of available dates: every `period` from `start` until `end`. */
export interface DateRange { start: string; end: string; step: number; unit: "D" | "M" }

/** The GIBS tile URL for a layer and date, with {z}/{y}/{x} left for Leaflet to fill in. */
export function tileUrl(g: Gibs, date: string): string {
  return `${WMTS}/${g.id}/default/${date}/${g.tileMatrixSet}/{z}/{y}/{x}.png`;
}

const cache = new Map<string, Promise<DateRange[]>>();

/** Available dates for a layer, from GIBS (cached per page load). Rejects if GIBS can't be reached. */
export function availableDates(g: Gibs): Promise<DateRange[]> {
  let p = cache.get(g.id);
  if (!p) {
    const url = `${WMTS}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER=${encodeURIComponent(g.id)}`
      + `&TILEMATRIXSET=${encodeURIComponent(g.tileMatrixSet)}`;
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(tr("GIBS answered {status}", { status: r.status }));
      return parseDomain(await r.text());
    });
    p.catch(() => cache.delete(g.id)); // let a later attempt retry
    cache.set(g.id, p);
  }
  return p;
}

/** "2015-03-31/2025-07-27/P1D,2025-07-29/2025-10-09/P1D" inside <Domain> → ranges. Sub-daily ranges are skipped. */
export function parseDomain(xml: string): DateRange[] {
  const text = /<Domain>([^<]*)<\/Domain>/.exec(xml)?.[1] ?? "";
  return text.split(",").flatMap((part) => {
    const [start, end, period] = part.trim().split("/");
    const m = /^P(\d+)([DM])$/.exec(period ?? "");
    if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
    return [{ start, end, step: Number(m[1]), unit: m[2] as "D" | "M" }];
  });
}

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addMonths = (s: string, n: number) => {
  const d = new Date(day(s));
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d.getTime());
};

/** The last available date on or before `wanted` within one range, or null. */
function lastInRange(r: DateRange, wanted: string): string | null {
  const limit = day(wanted) < day(r.end) ? wanted : r.end;
  if (day(limit) < day(r.start)) return null;
  if (r.unit === "D") {
    const k = Math.floor((day(limit) - day(r.start)) / (86_400_000 * r.step));
    return iso(day(r.start) + k * r.step * 86_400_000);
  }
  const months = (+limit.slice(0, 4) - +r.start.slice(0, 4)) * 12 + (+limit.slice(5, 7) - +r.start.slice(5, 7));
  let k = Math.floor(months / r.step);
  while (k >= 0 && day(addMonths(r.start, k * r.step)) > day(limit)) k--;
  return k >= 0 ? addMonths(r.start, k * r.step) : null;
}

/** The latest date with data on or before `wanted` (or the latest overall, when `wanted` is omitted). */
export function nearestDate(ranges: DateRange[], wanted?: string): string | null {
  const target = wanted ?? ranges.reduce((m, r) => (day(r.end) > day(m) ? r.end : m), "0000-01-01");
  return ranges.map((r) => lastInRange(r, target)).filter((d): d is string => !!d)
    .reduce<string | null>((best, d) => (!best || day(d) > day(best) ? d : best), null);
}

/** The available date before `date` (for stepping back when NASA lists a date it has no tiles for). */
export const previousDate = (ranges: DateRange[], date: string) => nearestDate(ranges, iso(day(date) - 86_400_000));

/** The earliest date in any range. */
export const firstDate = (ranges: DateRange[]) =>
  ranges.reduce<string | null>((m, r) => (!m || day(r.start) < day(m) ? r.start : m), null);
/** How often NASA has a picture, from the date run that contains `date` (DescribeDomains period). */
export function periodText(ranges: DateRange[], date: string): string | null {
  const r = ranges.find((x) => day(x.start) <= day(date) && day(date) <= day(x.end)) ?? null;
  if (!r) return null;
  if (r.unit === "M") return r.step === 1 ? "monthly" : tr("every {step} months", { step: r.step });
  return r.step === 1 ? "daily" : tr("every {step} days", { step: r.step });
}

/** The latest date in any range, as GIBS lists it (callers cap it at today, UTC). */
export const lastDate = (ranges: DateRange[]) =>
  ranges.reduce<string | null>((m, r) => (!m || day(r.end) > day(m) ? r.end : m), null);

/** NASA Worldview at this view, layer and date. */
export function worldviewUrl(layerId: string | undefined, date: string | undefined,
  bounds: { west: number; south: number; east: number; north: number }): string {
  const q = new URLSearchParams();
  q.set("v", [bounds.west, bounds.south, bounds.east, bounds.north].map((n) => n.toFixed(4)).join(","));
  if (layerId) q.set("l", layerId);
  if (date) q.set("t", `${date}-T00:00:00Z`);
  return `https://worldview.earthdata.nasa.gov/?${q.toString()}`;
}

/** The collection's granules in NASA Earthdata Search. */
export const earthdataSearchUrl = (conceptId: string) =>
  `https://search.earthdata.nasa.gov/search/granules?p=${encodeURIComponent(conceptId)}`;

/** Kept for existing imports: the shared day format. */
export { formatDay as formatDate } from "./dates";
