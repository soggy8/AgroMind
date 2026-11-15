import { Check, Loader2, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Drawer, KindTag, SegmentedTabs } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { simulatorApi } from "../api/simulatorApi";
import { pct, signed } from "../lib/format";
import type { Sim } from "../state/useSimulator";
import type { FinderResult } from "../types";
import { MAX_ROTATIONS } from "../types";
import { t } from "../../../shared/i18n";

/** Rotation finder: simulates every crop cycle up to three crops and lists the best for the farmer's priorities. */
export function FinderDrawer({ sim, onClose }: { sim: Sim; onClose: () => void }) {
  const u = useUnits();
  const { draft, actions, farmId } = sim;
  const [maxLength, setMaxLength] = useState<"2" | "3">("3");
  const [cover, setCover] = useState(false);
  const [result, setResult] = useState<FinderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await simulatorApi.find(farmId, {
        field_id: draft.fieldId, scenario: draft.scenario, priorities: draft.priorities,
        include_economics: draft.includeEconomics, max_length: Number(maxLength), cover_crop: cover, top: 6, units: u.system,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [draft, farmId, maxLength, cover, u.system]);

  useEffect(() => { void search(); }, [search]);

  if (!draft) return null;
  const full = draft.rotations.length >= MAX_ROTATIONS;
  const has = (crops: string[], c: boolean) => draft.rotations.some((r) =>
    !!r.cover_crop === c && r.crops.length === crops.length && r.crops.every((x, i) => x === crops[i]));

  return (
    <Drawer title={t("Suggest the best rotations")} icon={<Sparkles size={18} strokeWidth={1.75} className="text-lime" />} onClose={onClose}>
      <p className="text-[13px] leading-normal text-mut">
        {t("Tries every rotation of up to {maxLength} crops on this field, in your current scenario, and ranks them by your priorities.", { maxLength })}
        {draft.includeEconomics && t(" Economics is on, so only crops with Iowa prices and costs are included.")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SegmentedTabs<"2" | "3"> label={t("Longest rotation")} size="sm" value={maxLength} onChange={setMaxLength}
          items={[{ id: "2", label: t("Up to 2 crops") }, { id: "3", label: t("Up to 3 crops") }]} />
        <label className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-black/25 px-3 text-[13px] font-semibold">
          <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} className="h-4 w-4 accent-[var(--color-lime)]" />
          {t("With rye cover crop")}
        </label>
      </div>

      {busy && (
        <p className="mt-5 flex items-center gap-2 text-[13px] text-mut" role="status">
          <Loader2 size={16} className="animate-spin" /> {t("Simulating every rotation over 25 weather years…")}
        </p>
      )}
      {error && <p role="alert" className="mt-4 text-[13px] text-alert">{error}</p>}

      {result && !busy && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">{result.recommendation.headline}</h3>
            <KindTag kind="modelled" />
          </div>
          <p className="mt-0.5 text-[12px] text-mut">{t("{candidates_tested} rotations tested.", { candidates_tested: result.candidates_tested })}</p>
          <ol className="mt-2">
            {result.rotations.map((r) => {
              const inDraft = has(r.crops, r.cover_crop);
              return (
                <li key={r.rotation_id} className="border-b border-line py-3 last:border-0">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-5 text-[13px] font-bold text-mut">{r.rank}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{r.name}{r.cover_crop && t(" + rye cover")}</div>
                      <div className="mt-0.5 text-[12px] leading-snug text-mut">
                        {t("Yield {pct} of typical ({signed}% vs today){v}poor seasons {pct2} · soil {score}/100", { pct: pct(r.relative_yield.p50), signed: signed(r.vs_baseline.relative_yield_change_pct), v: " · ", pct2: pct(r.stress_season_frequency), score: r.soil.score })}
                        {r.economics && <> {t("· margin {moneyPerArea}{moneyUnit}/yr", { moneyPerArea: u.moneyPerArea(r.economics.margin_per_ha.p50), moneyUnit: u.moneyUnit })}</>}
                      </div>
                    </div>
                    {inDraft ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok"><Check size={14} /> {t("Comparing")}</span>
                    ) : (
                      <button type="button" disabled={full} onClick={() => actions.addRotation(r.crops, r.cover_crop)}
                        title={full ? t("Remove a rotation first ({MAX_ROTATIONS} max)", { MAX_ROTATIONS }) : t("Add to the comparison")}
                        className="inline-flex shrink-0 items-center gap-1 rounded-ctl border border-line bg-glass-hi px-2.5 py-1.5 text-[12px] font-semibold hover:bg-glass-sel disabled:opacity-45">
                        <Plus size={13} /> {t("Add")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {full && <p className="mt-2 text-[12px] text-mut">{t("You're comparing {MAX_ROTATIONS} rotations, the maximum. Remove one to add a suggestion.", { MAX_ROTATIONS })}</p>}
          <p className="mt-3 text-[12px] leading-snug text-mut">{result.data_note}</p>
        </>
      )}
    </Drawer>
  );
}
