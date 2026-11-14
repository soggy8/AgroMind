import { CircleCheck, Scale } from "lucide-react";
import { KindTag } from "../../../shared/components";
import { rotationColor } from "../lib/rotationColors";
import type { SimulationResult } from "../types";

/**
 * Top of the results panel. A lime-tinted wash marks "the suggested option"; the warm finding wash
 * is reserved for problems (DESIGN.md section 6).
 */
export function RecommendationBlock({ result }: { result: SimulationResult }) {
  const rec = result.recommendation;
  const best = result.rotations.find((r) => r.rotation_id === rec.rotation_id)!;
  return (
    <div className="border-b border-line bg-[linear-gradient(170deg,rgb(198_242_78/.16),rgb(198_242_78/.04)_55%,transparent)] px-[18px] pb-[18px] pt-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-mut">
          <i aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: rotationColor(best.input_index) }} />
          {rec.near_tie ? "Ranked for your priorities: near tie" : "Ranked first for your priorities"}
        </span>
        <KindTag kind="modelled" />
      </div>
      <h2 className="mt-2 text-[21px] font-bold leading-tight tracking-[-.01em]">{rec.headline}</h2>
      <ul className="mt-3 space-y-2">
        {rec.reasons.map((r) => (
          <li key={r} className="flex gap-2.5 text-sm leading-normal">
            <CircleCheck size={17} strokeWidth={1.75} className="mt-[2px] shrink-0 text-lime" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      {rec.trade_offs.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[.05em] text-mut">Trade-offs</div>
          <ul className="space-y-1.5">
            {rec.trade_offs.map((t) => (
              <li key={t} className="flex gap-2.5 text-[13px] leading-snug text-mut">
                <Scale size={15} strokeWidth={1.75} className="mt-[2px] shrink-0" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
