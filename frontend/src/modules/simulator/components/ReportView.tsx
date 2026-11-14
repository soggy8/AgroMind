import { useUnits } from "../../../shared/units";
import { isTodayClimate, pct, signed } from "../lib/format";
import type { SimulationResult, SimulatorOptions } from "../types";

/**
 * Printable one-page report (browser "Save as PDF"). Rendered only for print; the app itself is hidden then.
 * Plain black on white so it prints well and stays readable when photocopied.
 */
export function ReportView({ result, options }: { result: SimulationResult; options: SimulatorOptions }) {
  const u = useUnits();
  const s = result.scenario;
  const p = result.projection;
  const today = isTodayClimate(s);
  const rots = result.rotations;
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const scenarioText = p
    ? `NASA NEX-GDDP-CMIP6 projection: ${p.ssp_name}, ${p.years} (median of ${p.models} climate models: ${u.tempDelta(p.temp_change_c.median)}, ${signed(p.rain_change_pct.median)}% growing-season rain)`
    : today ? "Today's climate (no change)" : `${u.tempDelta(s.temp_delta_c)} temperature, ${signed(s.rain_change_pct)}% rainfall`;

  return (
    <article className="hidden bg-white p-8 font-sans text-[11pt] leading-snug text-black print:block">
      <header className="border-b-2 border-black pb-3">
        <div className="text-[9pt] uppercase tracking-wider">AgroMind · Crop rotation report</div>
        <h1 className="mt-1 text-[20pt] font-bold">{result.recommendation.headline}</h1>
        <div className="mt-1 text-[10pt]">
          {options.farm.name}{options.farm.region ? `, ${options.farm.region}` : ""} · {result.field_name} · soil {result.soil} · {date}
        </div>
      </header>

      <section className="mt-4">
        <h2 className="text-[12pt] font-bold">Scenario (hypothetical inputs)</h2>
        <p>{scenarioText}. Response to heat: {s.heat_response === "published" ? "published US average (Zhao et al. 2017)" : "this county's own history"}.
          {" "}Irrigation: {s.irrigation === "none" ? "none" : s.irrigation === "full" ? "full" : `up to ${u.water(s.irrigation_cap_mm ?? 0)} per season`}.
          {" "}{s.years} years, replayed over each of {result.ensemble_size} weather years ({result.ensemble_start_years[0]}–{result.ensemble_start_years.at(-1)}).</p>
      </section>

      <section className="mt-4">
        <h2 className="text-[12pt] font-bold">Why it ranks first</h2>
        <ul className="ml-5 list-disc">{result.recommendation.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        {result.recommendation.trade_offs.length > 0 && (
          <>
            <h3 className="mt-2 font-bold">Trade-offs</h3>
            <ul className="ml-5 list-disc">{result.recommendation.trade_offs.map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        )}
      </section>

      <section className="mt-4">
        <h2 className="text-[12pt] font-bold">Rotations compared (model estimates)</h2>
        <table className="mt-1 w-full border-collapse text-[9.5pt]">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Rotation</th><th className="pr-2 text-right">Yield (p10–p90)</th>
              {!today && <th className="pr-2 text-right">vs today</th>}
              {!today && <th className="pr-2 text-right">other heat setting</th>}
              <th className="pr-2 text-right">Poor seasons</th><th className="pr-2 text-right">Water met</th>
              <th className="pr-2 text-right">Irrigation/yr</th><th className="pr-2 text-right">Soil</th>
              {result.economics_included && <th className="text-right">Margin/yr</th>}
            </tr>
          </thead>
          <tbody>
            {rots.map((r) => (
              <tr key={r.rotation_id} className="border-b border-black/30">
                <td className="py-1 pr-2">{r.rank}</td>
                <td className="pr-2">{r.name}{r.cover_crop ? " + rye cover" : ""}</td>
                <td className="pr-2 text-right">{pct(r.relative_yield.p50)} ({pct(r.relative_yield.p10)}–{pct(r.relative_yield.p90)})</td>
                {!today && <td className="pr-2 text-right">{signed(r.vs_baseline.relative_yield_change_pct)}%</td>}
                {!today && <td className="pr-2 text-right">{r.vs_baseline.other_heat_response_change_pct === null ? "–" : `${signed(r.vs_baseline.other_heat_response_change_pct)}%`}</td>}
                <td className="pr-2 text-right">{pct(r.stress_season_frequency)}</td>
                <td className="pr-2 text-right">{pct(r.rain_sufficiency.p50)}</td>
                <td className="pr-2 text-right">{u.water(r.irrigation_mm_per_year.p50)}</td>
                <td className="pr-2 text-right">{r.soil.score}</td>
                {result.economics_included && <td className="text-right">{r.economics ? `${u.moneyPerArea(r.economics.margin_per_ha.p50)}${u.moneyUnit}` : "–"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[8.5pt]">Yield is a share of the crop's typical yield in today's climate. Poor season: below 70% of typical. Water met: share of crop water need covered by rain and stored soil water.</p>
      </section>

      <section className="mt-4">
        <h2 className="text-[12pt] font-bold">Growing-season climate (May–Sep, per year)</h2>
        <table className="mt-1 w-full border-collapse text-[9.5pt]">
          <thead><tr className="border-b border-black text-left"><th className="py-1">Measure</th><th className="text-right">Observed (NASA POWER)</th>{!today && <th className="text-right">Scenario</th>}</tr></thead>
          <tbody>
            {[
              ["Rain", u.water(result.baseline_climate.growing_season_rain_mm), u.water(result.scenario_climate.growing_season_rain_mm)],
              ["Average max temperature", u.temp(result.baseline_climate.growing_season_tmax_c), u.temp(result.scenario_climate.growing_season_tmax_c)],
              ["Days at or above 35 °C", `${result.baseline_climate.hot_days_per_year}`, `${result.scenario_climate.hot_days_per_year}`],
            ].map(([label, a, b]) => (
              <tr key={label} className="border-b border-black/30"><td className="py-1">{label}</td><td className="text-right">{a}</td>{!today && <td className="text-right">{b}</td>}</tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 break-inside-avoid-page">
        <h2 className="text-[12pt] font-bold">How these numbers are made</h2>
        <p className="text-[9pt]">{result.data_note}</p>
        <ul className="ml-5 mt-1 list-disc text-[8.5pt]">
          {result.assumptions.map((a) => <li key={a.topic}><b>{a.topic}:</b> {a.text} <i>({a.source})</i></li>)}
        </ul>
      </section>
      <footer className="mt-4 border-t border-black pt-2 text-[8pt]">
        Model estimates, not forecasts. AgroMind simulator {result.model_version}. Check decisions against field conditions and local advice.
      </footer>
    </article>
  );
}
