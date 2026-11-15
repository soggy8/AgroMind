import { InfoTip, KindTag } from "../../../shared/components";
import { type Units, useUnits } from "../../../shared/units";
import { pct } from "../lib/format";
import { rotationColor } from "../lib/rotationColors";
import type { RotationResult, SimulationResult } from "../types";
import { t } from "../../../shared/i18n";

interface Indicator {
  id: string;
  label: string;
  note: string;
  info: string;
  max: number;
  value: (r: RotationResult) => number | null;
  low?: (r: RotationResult) => number;
  high?: (r: RotationResult) => number;
  fmt: (x: number) => string;
  better: "higher" | "lower";
}

const indicators = (u: Units): Indicator[] => [
  {
    id: "yield", label: t("Yield"), note: t("share of typical yield, p10–p90"), max: 1.2, better: "higher",
    info: t("100% is what the crop yields in an average year of today's climate. The bar is the middle year; the whisker spans the worst 10% to the best 10% of the 25 weather years."),
    value: (r) => r.relative_yield.p50, low: (r) => r.relative_yield.p10, high: (r) => r.relative_yield.p90, fmt: (x) => pct(x),
  },
  {
    id: "water", label: t("Water need met without irrigation"), note: t("rain + stored soil water"), max: 1, better: "higher",
    info: t("How much of the crops' water demand rain and the water already in the soil cover. Below 100%, the crop is short of water unless irrigated."),
    value: (r) => r.rain_sufficiency.p50, low: (r) => r.rain_sufficiency.p10, high: (r) => r.rain_sufficiency.p90, fmt: (x) => pct(x),
  },
  {
    id: "irrigation", label: t("Irrigation"), note: t("{waterUnit} per year", { waterUnit: u.waterUnit }), max: 0, better: "lower",
    info: t("Water pumped on average per year, counting years between crops."),
    value: (r) => r.irrigation_mm_per_year.p50, low: (r) => r.irrigation_mm_per_year.p10, high: (r) => r.irrigation_mm_per_year.p90,
    fmt: u.water,
  },
  {
    id: "risk", label: t("Poor seasons"), note: t("below 70% of typical yield"), max: 0, better: "lower",
    info: t("The share of all simulated seasons where a crop yields less than 70% of typical: the years that hurt."),
    value: (r) => r.stress_season_frequency, fmt: (x) => pct(x),
  },
  {
    id: "soil", label: t("Soil index"), note: t("rotation diversity, legume, residue"), max: 100, better: "higher",
    info: t("A 0–100 score of the rotation itself: more different crops, a legume, crop residue left on the field and a cover crop score higher; a crop following itself scores lower. Not a soil measurement."),
    value: (r) => r.soil.score, fmt: (x) => `${Math.round(x)}`,
  },
  {
    id: "margin", label: t("Margin"), note: t("USD{moneyUnit} per year, after land rent", { moneyUnit: u.moneyUnit }), max: 0, better: "higher",
    info: t("Revenue minus all costs in Iowa State's 2026 budgets, including cash rent and labour, at USDA's 2026/27 projected prices. What is left pays for management."),
    value: (r) => r.economics?.margin_per_ha.p50 ?? null, low: (r) => r.economics!.margin_per_ha.p10,
    high: (r) => r.economics!.margin_per_ha.p90, fmt: u.moneyPerArea,
  },
];

/** One bar group per indicator; whiskers show the p10–p90 range across weather years. */
export function IndicatorBars({ result }: { result: SimulationResult }) {
  const INDICATORS = indicators(useUnits());
  const rots = [...result.rotations].sort((a, b) => a.input_index - b.input_index);
  const shown = INDICATORS.filter((ind) => {
    if (ind.id === "irrigation") return rots.some((r) => r.irrigation_mm_per_year.p90 > 0);
    if (ind.id === "margin") return rots.every((r) => r.economics);
    return true;
  });
  return (
    <section aria-labelledby="ind-h">
      <div className="flex items-center justify-between">
        <h3 id="ind-h" className="text-[15px] font-bold">{t("Indicators")}</h3>
        <KindTag kind="modelled" />
      </div>
      <div className="mt-1">
        {shown.map((ind) => <IndicatorGroup key={ind.id} ind={ind} rots={rots} />)}
      </div>
    </section>
  );
}

function IndicatorGroup({ ind, rots }: { ind: Indicator; rots: RotationResult[] }) {
  const vals = rots.map((r) => ind.value(r) ?? 0);
  const highs = rots.map((r) => (ind.high ? ind.high(r) : ind.value(r) ?? 0));
  const lows = rots.map((r) => (ind.low ? ind.low(r) : ind.value(r) ?? 0));
  const signedScale = ind.id === "margin";
  const auto = Math.max(...highs.map(Math.abs), ...lows.map(Math.abs), 1e-9) * 1.05;
  const max = ind.max || (ind.id === "risk" ? Math.max(0.25, auto) : auto);
  const pos = (x: number) => (signedScale ? 50 + (x / max) * 50 : Math.max(0, Math.min(100, (x / max) * 100)));
  const zero = signedScale ? 50 : 0;
  return (
    <div className="border-b border-line py-2.5 last:border-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-0.5 text-sm font-semibold">{t(ind.label)}<InfoTip label={ind.label}>{t(ind.info)}</InfoTip></span>
        <span className="text-[12px] text-mut">{t(ind.note)}</span>
      </div>
      <div className="space-y-1.5">
        {rots.map((r, i) => {
          const v = vals[i];
          const left = Math.min(pos(v), zero);
          const width = Math.abs(pos(v) - zero);
          return (
            <div key={r.rotation_id} className="grid grid-cols-[1fr_64px] items-center gap-2" title={`${r.name}: ${ind.fmt(v)}`}>
              <div className="relative h-[10px] rounded-[3px] bg-white/[.06]">
                {signedScale && <b aria-hidden className="absolute top-[-3px] h-4 w-px bg-white/40" style={{ left: "50%" }} />}
                <i aria-hidden className="absolute bottom-0 top-0 rounded-[3px]"
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%`, background: rotationColor(r.input_index), opacity: 0.9 }} />
                {ind.low && ind.high && (
                  <span aria-hidden className="absolute top-1/2 h-px -translate-y-1/2 bg-white/80"
                    style={{ left: `${pos(lows[i])}%`, width: `${Math.max(pos(highs[i]) - pos(lows[i]), 0)}%` }}>
                    <span className="absolute -top-[3px] left-0 h-[7px] w-px bg-white/80" />
                    <span className="absolute -top-[3px] right-0 h-[7px] w-px bg-white/80" />
                  </span>
                )}
              </div>
              <span className="text-right text-[13px] font-bold">
                <span className="sr-only">{r.name}: </span>{ind.fmt(v)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
