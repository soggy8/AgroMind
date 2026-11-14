import { KindTag } from "../../../shared/components";
import { type Units, useUnits } from "../../../shared/units";
import { isTodayClimate, signed } from "../lib/format";
import type { ClimateSummary, SimulationResult } from "../types";

type Row = { key: keyof ClimateSummary; label: string; hue: string; fmt: (x: number) => string; delta: (d: number) => string };

function rows(u: Units): Row[] {
  const water = (d: number) => `${d > 0 ? "+" : d < 0 ? "\u2212" : ""}${u.water(Math.abs(d))}`;
  return [
    { key: "growing_season_rain_mm", label: "Rain, May–Sep", hue: "var(--color-rain)", fmt: u.water, delta: water },
    { key: "growing_season_tmax_c", label: "Max temperature", hue: "var(--color-heat)", fmt: u.temp, delta: (d) => u.tempDelta(d) },
    { key: "hot_days_per_year", label: "Days ≥ 35 °C", hue: "var(--color-heat)", fmt: (x) => `${x.toFixed(1)} /yr`, delta: (d) => signed(d, 1) },
    { key: "growing_season_et0_mm", label: "Water demand (ET₀)", hue: "var(--color-water)", fmt: u.water, delta: water },
  ];
}

/** Observed growing-season climate next to the scenario version of it. */
export function ClimateCompare({ result }: { result: SimulationResult }) {
  const u = useUnits();
  const ROWS = rows(u);
  const base = result.baseline_climate;
  const scen = result.scenario_climate;
  const today = isTodayClimate(result.scenario);
  return (
    <section aria-labelledby="climate-h">
      <h3 id="climate-h" className="text-[15px] font-bold">Growing-season climate</h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-1.5 font-normal"><span className="sr-only">Measure</span></th>
            <th className="pb-1.5 text-right font-normal"><KindTag kind="observed" /></th>
            {!today && <th className="pb-1.5 text-right font-normal"><KindTag kind="scenario" /></th>}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const b = base[r.key] as number;
            const s = scen[r.key] as number;
            return (
              <tr key={r.key} className="border-t border-line">
                <th scope="row" className="py-2 text-left font-semibold">
                  <span className="flex items-center gap-2">
                    <i aria-hidden className="h-2 w-2 rounded-[3px]" style={{ background: r.hue }} />{r.label}
                  </span>
                </th>
                <td className="py-2 text-right font-bold">{r.fmt(b)}</td>
                {!today && (
                  <td className="py-2 text-right font-bold">
                    {r.fmt(s)}
                    <span className="block text-[12px] font-bold text-mut">{r.delta(s - b)}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[12px] leading-snug text-mut">
        {base.source}, averaged per year. Driest season on record: {base.driest_year} ({Math.round(base.driest_year_rain_mm)} mm).
      </p>
    </section>
  );
}
