import type { IndicatorId, Priorities } from "../types";
import { t } from "../../../shared/i18n";

const LEVELS = [
  { v: 0, label: t("Off") },
  { v: 1, label: t("Low") },
  { v: 2, label: t("Med") },
  { v: 3, label: t("High") },
];

export const PRIORITY_LABEL: Record<IndicatorId, string> = {
  yield: t("Yield"),
  water: t("Save water"),
  risk: t("Avoid bad years"),
  soil: t("Soil health"),
  margin: t("Margin"),
};

/** How much each indicator counts in the ranking. Weights are normalised on the server. */
export function PriorityControls({ priorities, economics, onChange, onEconomics }: {
  priorities: Priorities;
  economics: boolean;
  onChange: (k: IndicatorId, v: number) => void;
  onEconomics: (on: boolean) => void;
}) {
  const ids: IndicatorId[] = ["yield", "water", "risk", "soil", "margin"];
  return (
    <section aria-labelledby="priorities-h">
      <h2 id="priorities-h" className="mb-1 text-[15px] font-bold">{t("Your priorities")}</h2>
      <p className="mb-2 text-[12px] text-mut">{t("How much each one counts when ranking rotations.")}</p>
      <div className="space-y-1.5">
        {ids.map((k) => {
          const disabled = k === "margin" && !economics;
          const value = Math.round(priorities[k]);
          return (
            <div key={k} className={`flex items-center justify-between gap-2 ${disabled ? "opacity-45" : ""}`}>
              <span className="text-sm font-semibold">{PRIORITY_LABEL[k]}</span>
              <div role="radiogroup" aria-label={t("{v} weight", { v: PRIORITY_LABEL[k] })} className="flex gap-0.5 rounded-[10px] bg-black/25 p-0.5">
                {LEVELS.map((l) => (
                  <button key={l.v} type="button" role="radio" aria-checked={value === l.v} disabled={disabled}
                    onClick={() => onChange(k, l.v)}
                    className={`min-w-[40px] rounded-[8px] px-2 py-1 text-[12px] font-semibold ${
                      value === l.v ? "bg-glass-sel text-tx shadow-[inset_0_1px_0_rgb(255_255_255/.15)]" : "text-mut hover:text-tx"}`}>
                    {t(l.label)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={economics} onChange={(e) => onEconomics(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-lime)]" />
        <span>
          <span className="font-semibold">{t("Include economics")}</span>
          <span className="block text-[12px] text-mut">{t("2026 Iowa costs (ISU) and USDA price projections.")}</span>
        </span>
      </label>
    </section>
  );
}
