import { Columns2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Drawer, KindTag } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { simulatorApi } from "../api/simulatorApi";
import { pct, signed } from "../lib/format";
import type { RotationResult, SavedRun } from "../types";
import { t } from "../../../shared/i18n";

/** Two saved runs side by side, rotations matched by their crops. */
export function CompareRunsDrawer({ farmId, runIds, onClose }: { farmId: string; runIds: [string, string]; onClose: () => void }) {
  const u = useUnits();
  const [runs, setRuns] = useState<[SavedRun, SavedRun] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all(runIds.map((id) => simulatorApi.getRun(farmId, id)))
      .then(([a, b]) => setRuns([a, b]))
      .catch((e: Error) => setError(e.message));
  }, [farmId, runIds]);

  const scenarioText = (r: SavedRun) => {
    const s = r.result.scenario;
    const p = r.result.projection;
    const climate = p ? `${p.ssp_name.split(" (")[0]}, ${p.period}` : `${u.tempDelta(s.temp_delta_c)}, ${t("{v}% rain", { v: signed(s.rain_change_pct) })}`;
    return `${climate} · ${s.irrigation === "none" ? t("rain-fed") : s.irrigation === "full" ? t("full irrigation") : t("limited irrigation")} · ${s.heat_response === "published" ? t("US research heat") : t("county heat")}`;
  };
  const key = (r: RotationResult) => `${r.crops.join(">")}${r.cover_crop ? "+rye" : ""}`;

  return (
    <Drawer title={t("Compare saved runs")} icon={<Columns2 size={18} strokeWidth={1.75} className="text-lime" />} onClose={onClose} width={640}>
      {!runs && !error && <p className="flex items-center gap-2 text-[13px] text-mut" role="status"><Loader2 size={16} className="animate-spin" /> {t("Loading both runs…")}</p>}
      {error && <p role="alert" className="text-[13px] text-alert">{error}</p>}
      {runs && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {runs.map((r) => (
              <div key={r.id} className="rounded-chip border border-line bg-glass-hi p-3">
                <div className="text-sm font-bold">{r.name}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-mut">{scenarioText(r)}</div>
                <div className="mt-2 text-[13px]"><span className="text-mut">{t("Top:")} </span><span className="font-semibold">{r.recommended_rotation}</span></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">{t("Rotation by rotation")}</h3>
            <KindTag kind="modelled" />
          </div>
          <table className="mt-2 w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-mut">
                <th className="pb-1 font-semibold">{t("Rotation")}</th>
                <th className="pb-1 font-semibold">{t("Measure")}</th>
                <th className="pb-1 text-right font-semibold">{runs[0].name}</th>
                <th className="pb-1 text-right font-semibold">{runs[1].name}</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set([...runs[0].result.rotations, ...runs[1].result.rotations].map(key))].map((k) => {
                const [a, b] = runs.map((r) => r.result.rotations.find((x) => key(x) === k));
                const name = (a ?? b)!.name + ((a ?? b)!.cover_crop ? " + rye" : "");
                const rows: [string, (r: RotationResult) => string][] = [
                  [t("Rank"), (r) => `${r.rank}`],
                  [t("Yield"), (r) => t("{pct} of typical", { pct: pct(r.relative_yield.p50) })],
                  ["vs today", (r) => `${signed(r.vs_baseline.relative_yield_change_pct)}%`],
                  [t("Poor seasons"), (r) => pct(r.stress_season_frequency)],
                  [t("Irrigation"), (r) => `${u.water(r.irrigation_mm_per_year.p50)}/yr`],
                  [t("Soil index"), (r) => `${r.soil.score}`],
                  [t("Margin"), (r) => (r.economics ? `${u.moneyPerArea(r.economics.margin_per_ha.p50)}${u.moneyUnit}` : "–")],
                ];
                return rows.map(([label, f], i) => (
                  <tr key={`${k}-${label}`} className={i === 0 ? "border-t border-line" : ""}>
                    <td className="py-1 pr-2 align-top font-semibold">{i === 0 ? name : ""}</td>
                    <td className="py-1 text-mut">{label}</td>
                    <td className="py-1 text-right">{a ? f(a) : t("not run")}</td>
                    <td className="py-1 text-right">{b ? f(b) : t("not run")}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] leading-snug text-mut">
            {t("Each run keeps the result it was saved with, including the model version ({model_version} and {model_version2}).", { model_version: runs[0].result.model_version, model_version2: runs[1].result.model_version })}
          </p>
        </>
      )}
    </Drawer>
  );
}
