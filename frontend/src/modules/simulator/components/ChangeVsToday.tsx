import { InfoTip } from "../../../shared/components";
import { isTodayClimate, pct, pctRange, signed } from "../lib/format";
import { rotationColor } from "../lib/rotationColors";
import type { SimulationResult } from "../types";
import { t } from "../../../shared/i18n";

/**
 * The headline comparison: each rotation's change against the same rotation in today's climate.
 * Differences are more trustworthy than absolute levels (docs/modules/simulator.md section 4).
 */
export function ChangeVsToday({ result }: { result: SimulationResult }) {
  const today = isTodayClimate(result.scenario);
  return (
    <section aria-labelledby="change-h">
      <div className="flex items-baseline justify-between">
        <h3 id="change-h" className="flex items-center gap-0.5 text-[15px] font-bold">
          {today ? t("Yield in today's climate") : t("Change vs today's climate")}
          <InfoTip label={t("Change vs today's climate")}>
            {t("Each rotation is run twice on the same 25 weather years: once as they were, once with the scenario. The big number is the difference. \"Typical\" is the crop's average yield today; the range covers the worst 10% to the best 10% of years.")}
          </InfoTip>
        </h3>
        <span className="text-[12px] text-mut">{t("p50, range p10–p90")}</span>
      </div>
      <ul className="mt-1">
        {result.rotations.map((r) => {
          const d = r.vs_baseline.relative_yield_change_pct;
          const poorDelta = r.vs_baseline.stress_frequency_change;
          const alt = r.vs_baseline.other_heat_response_change_pct;
          const altLabel = result.scenario.heat_response === "published" ? "county history" : t("US research");
          return (
            <li key={r.rotation_id} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-line py-2.5 last:border-0">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <span className="w-4 text-[12px] font-bold text-mut">{r.rank}</span>
                <i aria-hidden className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: rotationColor(r.input_index) }} />
                <span className="truncate">{r.name}</span>
              </div>
              <div className="row-span-2 text-right">
                {today ? (
                  <div className="text-[18px] font-extrabold">{pct(r.relative_yield.p50)}</div>
                ) : (
                  <div className={`text-[18px] font-extrabold ${d <= -10 ? "text-alert" : d <= -3 ? "text-watch" : "text-tx"}`}>
                    {signed(d)}%
                  </div>
                )}
                <div className="text-[12px] font-bold text-mut">{t("yield")}</div>
              </div>
              <div className="pl-6 text-[12px] text-mut">
                {t("{pct} of typical ({pctRange})", { pct: pct(r.relative_yield.p50), pctRange: pctRange(r.relative_yield) })}
                {!today && Math.abs(poorDelta) >= 0.005 && <> {t("· poor seasons {signed} pts", { signed: signed(poorDelta * 100) })}</>}
                {!today && alt !== null && Math.abs(alt - d) >= 0.5 && <span className="block">{t("With {altLabel}: {signed}%", { altLabel, signed: signed(alt) })}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
