/**
 * CropTwin: the last 30 days of NASA POWER daily weather at the selected field's centroid
 * (GET /api/farms/{farm}/fields/{field}/weather, backend weather_source.py). Labelled OBSERVED with its source, as NASA
 * POWER weather is on every dashboard (DESIGN.md section 6). Units and long names come from POWER's response and follow
 * the shared Metric/US setting; the 30-day totals and means are computed here, and the card says so.
 */
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { KindTag } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { formatDay, formatDayWithAge } from "../../../shared/map/dates";
import { croptwinApi } from "../api/croptwinApi";
import type { WeatherOut, WeatherSeries } from "../types";
import { metaCls, sectionTitle } from "./form";
import { t as tr } from "../../../shared/i18n";

/** Display form of POWER's unit strings (the units themselves come from POWER's response). */
const UNIT: Record<string, string> = { C: "°C", "MJ/m^2/day": "MJ/m²/day" };
const unit = (u: string) => UNIT[u] ?? u;

/** Per parameter: what the 30-day figure is, and which token colour its line uses (DESIGN.md indicator hues). */
const SUMMARY: Record<string, { how: "total" | "mean"; hue: string; label: string }> = {
  PRECTOTCORR: { how: "total", hue: "var(--color-rain)", label: tr("Precipitation") },
  T2M_MAX: { how: "mean", hue: "var(--color-heat)", label: tr("Max air temperature") },
  T2M_MIN: { how: "mean", hue: "var(--color-heat)", label: tr("Min air temperature") },
  ALLSKY_SFC_SW_DWN: { how: "mean", hue: "var(--color-soil)", label: tr("Solar radiation") },
};

const round = (n: number) => Math.round(n * 10) / 10;

/** POWER speaks metric; with US units, rain becomes inches and temperature °F. */
function convert(units: string, us: boolean): { f: (v: number) => number; unit: string } {
  if (us && units === "C") return { f: (v) => v * 1.8 + 32, unit: "°F" };
  if (us && units === "mm/day") return { f: (v) => Math.round((v / 25.4) * 100) / 100, unit: "in/day" };
  return { f: (v) => v, unit: unit(units) };
}

/** Last 30 days of NASA POWER daily weather at the field's centroid (Modelled, with POWER's own units). */
export function WeatherCard({ farmId, fieldId }: { farmId: string; fieldId: string }) {
  const [state, setState] = useState<{ status: "loading" | "done" | "error"; data?: WeatherOut; error?: string }>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    croptwinApi.fieldWeather(farmId, fieldId, ctrl.signal)
      .then((data) => setState({ status: "done", data }))
      .catch((e) => { if ((e as Error).name !== "AbortError") setState({ status: "error", error: (e as Error).message }); });
    return () => ctrl.abort();
  }, [farmId, fieldId]);

  const w = state.data;
  // The last day on which POWER has any of the four values (recent days fill in as NASA processes them).
  const lastWithData = w?.series.flatMap((s) => s.dates.filter((_, i) => s.values[i] !== null)).sort().at(-1) ?? null;
  return (
    <section aria-labelledby="weather-h">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 id="weather-h" className={sectionTitle}>{tr("Recent weather")}</h2>
        <KindTag kind="observed" />
      </div>
      {state.status === "loading" && (
        <p className="flex items-center gap-1.5 text-[13px] text-mut" role="status"><Loader2 size={13} className="animate-spin" /> {tr("Loading NASA POWER data…")}</p>
      )}
      {state.status === "error" && <p role="alert" className="text-[13px] leading-snug text-alert">{state.error}</p>}
      {w && (
        <>
          <p className={`mb-2 ${metaCls}`}>
            {tr("Daily values at the field's centre,")} {w.start && w.end ? `${formatDay(w.start)} – ${formatDay(w.end)}` : tr("last 30 days")}.
            {lastWithData ? tr(" Last day with data: {formatDayWithAge}.", { formatDayWithAge: formatDayWithAge(lastWithData) }) : tr(" No days with data yet.")} {tr("Recent days fill in as NASA processes them.")}
          </p>
          <table className="w-full text-[13px]">
            <caption className="sr-only">{tr("NASA POWER daily weather, last 30 days")}</caption>
            <thead>
              <tr className="text-left text-[12px] text-mut">
                <th scope="col" className="py-1 pr-2 font-semibold">{tr("Daily")}</th>
                <th scope="col" className="px-1 py-1 text-right font-semibold">{tr("30 days")}</th>
                <th scope="col" className="px-1 py-1 text-right font-semibold">{tr("Latest")}</th>
                <th scope="col" className="py-1 pl-2"><span className="sr-only">{tr("Trend")}</span></th>
              </tr>
            </thead>
            <tbody>
              {w.series.map((s) => <Row key={s.id} s={s} />)}
            </tbody>
          </table>
          <p className={`mt-2 ${metaCls}`}>
            {tr("Observed: {source}, built from {join} (as listed in POWER's response). Point {toFixed},{v}{toFixed2}; days in", { source: w.source, join: w.sources.join(", "), toFixed: w.latitude.toFixed(2), v: " ", toFixed2: w.longitude.toFixed(2) })} {w.time_standard === "LST" ? tr("local solar time") : w.time_standard}{tr(". 30-day figures are computed by AgroMind from these daily values.")}
          </p>
        </>
      )}
    </section>
  );
}

function Row({ s }: { s: WeatherSeries }) {
  const meta = SUMMARY[s.id] ?? { how: "mean", hue: "var(--color-mut)", label: s.name };
  const c = convert(s.units, useUnits().system === "us");
  const known = s.values.map((v, i) => ({ v, d: s.dates[i] })).filter((x): x is { v: number; d: string } => x.v !== null)
    .map((x) => ({ ...x, v: c.f(x.v) }));
  const summary = known.length
    ? meta.how === "total" ? known.reduce((t, x) => t + x.v, 0) : known.reduce((t, x) => t + x.v, 0) / known.length
    : null;
  const latest = known[known.length - 1];
  const u = c.unit;
  const total = (n: number) => (c.unit === "in/day" ? Math.round(n * 100) / 100 : round(n));
  return (
    <tr className="border-t border-line align-middle">
      <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
        {tr(meta.label)}
        <span className="block text-[12px] font-normal text-mut">{s.name} ({u})</span>
      </th>
      <td className="px-1 py-1.5 text-right">
        {summary === null ? "–" : <>{total(summary)} <span className="text-[12px] text-mut">{meta.how === "total" ? tr("{replace} total", { replace: u.replace("/day", "") }) : tr("{u} mean", { u })}</span></>}
        {known.length < s.values.length && <span className="block text-[12px] text-mut">{tr("{length} of {length2} days", { length: known.length, length2: s.values.length })}</span>}
      </td>
      <td className="px-1 py-1.5 text-right">
        {latest ? <>{total(latest.v)}<span className="block text-[12px] text-mut">{formatDay(latest.d).replace(/, \d{4}$/, "")}</span></> : "–"}
      </td>
      <td className="py-1.5 pl-2"><Spark values={s.values} colour={meta.hue} label={tr("{label}, daily", { label: meta.label })} /></td>
    </tr>
  );
}

/** Tiny line of the daily values; gaps where POWER has no value. */
function Spark({ values, colour, label }: { values: (number | null)[]; colour: string; label: string }) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const [min, max] = [Math.min(...known), Math.max(...known)];
  const W = 64, H = 22;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => (max === min ? H / 2 : H - 2 - ((v - min) / (max - min)) * (H - 4));
  const d = values.reduce((path, v, i) => (v === null ? path : `${path}${path && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke={colour} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
