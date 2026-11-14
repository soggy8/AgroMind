import { KindTag } from "../../../shared/components";
import { pct, usd } from "../lib/format";
import { rotationColor } from "../lib/rotationColors";
import type { RotationResult, SimulationResult } from "../types";

interface Indicator {
  id: string;
  label: string;
  note: string;
  max: number;
  value: (r: RotationResult) => number | null;
  low?: (r: RotationResult) => number;
  high?: (r: RotationResult) => number;
  fmt: (x: number) => string;
  better: "higher" | "lower";
}

const INDICATORS: Indicator[] = [
  {
    id: "yield", label: "Yield", note: "share of typical yield, p10–p90", max: 1.2, better: "higher",
    value: (r) => r.relative_yield.p50, low: (r) => r.relative_yield.p10, high: (r) => r.relative_yield.p90, fmt: (x) => pct(x),
  },
  {
    id: "water", label: "Water need met without irrigation", note: "rain + stored soil water", max: 1, better: "higher",
    value: (r) => r.rain_sufficiency.p50, low: (r) => r.rain_sufficiency.p10, high: (r) => r.rain_sufficiency.p90, fmt: (x) => pct(x),
  },
  {
    id: "irrigation", label: "Irrigation", note: "mm per year", max: 0, better: "lower",
    value: (r) => r.irrigation_mm_per_year.p50, low: (r) => r.irrigation_mm_per_year.p10, high: (r) => r.irrigation_mm_per_year.p90,
    fmt: (x) => `${Math.round(x)} mm`,
  },
  {
    id: "risk", label: "Poor seasons", note: "below 70% of typical yield", max: 0, better: "lower",
    value: (r) => r.stress_season_frequency, fmt: (x) => pct(x),
  },
  {
    id: "soil", label: "Soil index", note: "rotation diversity, legume, residue", max: 100, better: "higher",
    value: (r) => r.soil.score, fmt: (x) => `${Math.round(x)}`,
  },
  {
    id: "margin", label: "Margin", note: "USD per ha per year, after land rent", max: 0, better: "higher",
    value: (r) => r.economics?.margin_per_ha.p50 ?? null, low: (r) => r.economics!.margin_per_ha.p10,
    high: (r) => r.economics!.margin_per_ha.p90, fmt: usd,
  },
];

/** One bar group per indicator; whiskers show the p10–p90 range across weather years. */
export function IndicatorBars({ result }: { result: SimulationResult }) {
  const rots = [...result.rotations].sort((a, b) => a.input_index - b.input_index);
  const shown = INDICATORS.filter((ind) => {
    if (ind.id === "irrigation") return rots.some((r) => r.irrigation_mm_per_year.p90 > 0);
    if (ind.id === "margin") return rots.every((r) => r.economics);
    return true;
  });
  return (
    <section aria-labelledby="ind-h">
      <div className="flex items-center justify-between">
        <h3 id="ind-h" className="text-[15px] font-bold">Indicators</h3>
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
        <span className="text-sm font-semibold">{ind.label}</span>
        <span className="text-[12px] text-mut">{ind.note}</span>
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
