import { KindTag } from "../../../shared/components";
import { isTodayClimate, signed } from "../lib/format";
import type { ClimateSummary, SimulationResult } from "../types";

const ROWS: { key: keyof ClimateSummary; label: string; unit: string; hue: string; digits: number }[] = [
  { key: "growing_season_rain_mm", label: "Rain, May–Sep", unit: "mm", hue: "var(--color-rain)", digits: 0 },
  { key: "growing_season_tmax_c", label: "Max temperature", unit: "°C", hue: "var(--color-heat)", digits: 1 },
  { key: "hot_days_per_year", label: "Days ≥ 35 °C", unit: "/yr", hue: "var(--color-heat)", digits: 1 },
  { key: "growing_season_et0_mm", label: "Water demand (ET₀)", unit: "mm", hue: "var(--color-water)", digits: 0 },
];

/** Observed growing-season climate next to the scenario version of it. */
export function ClimateCompare({ result }: { result: SimulationResult }) {
  const base = result.baseline_climate;
  const scen = result.scenario_climate;
  const today = isTodayClimate(result.scenario);
  return (
    <section aria-labelledby="climate-h">
      <h3 id="climate-h" className="text-[15px] font-bold">Growing-season climate</h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-1.5 font-normal" />
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
                <td className="py-2 text-right font-bold">{b.toFixed(r.digits)} <span className="text-[12px] font-medium text-mut">{r.unit}</span></td>
                {!today && (
                  <td className="py-2 text-right font-bold">
                    {s.toFixed(r.digits)} <span className="text-[12px] font-medium text-mut">{r.unit}</span>
                    <span className="block text-[12px] font-bold text-mut">{signed(s - b, r.digits)}</span>
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
