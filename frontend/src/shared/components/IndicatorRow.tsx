import { KindTag, type ValueKind } from "./KindTag";

type Hue = "lime" | "rain" | "heat" | "water" | "soil";

// Written out literally so Tailwind generates every class.
const dot: Record<Hue, string> = { lime: "bg-lime", rain: "bg-rain", heat: "bg-heat", water: "bg-water", soil: "bg-soil" };
const toneText = { watch: "text-watch", alert: "text-alert", ok: "text-ok" } as const;

/** Where the normal sits on the vs-normal track; the fill runs to value / normal of that. */
const NORMAL_AT = 2 / 3;

/**
 * Indicator row (DESIGN.md section 6): hue dot, name, kind tag and source, value and delta,
 * and a vs-normal bar with a white tick at the normal. `ratio` is value / normal.
 */
export function IndicatorRow({ hue, name, kind, source, value, delta, ratio, tone, title }: {
  hue: Hue;
  name: string;
  kind: ValueKind;
  source: string;
  value: string;
  delta?: string;
  ratio?: number | null;
  tone?: "watch" | "alert" | "ok";
  title?: string;
}) {
  const fill = ratio == null ? null : Math.max(0, Math.min(1, ratio * NORMAL_AT));
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 border-b border-line py-2.5 last:border-0" title={title}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <i aria-hidden className={`h-2 w-2 shrink-0 rounded-[3px] ${dot[hue]}`} />
        {name}
      </div>
      <div className="row-span-2 text-right">
        <span className="block text-[18px] font-extrabold">{value}</span>
        {delta && <span className={`block text-[12px] font-bold ${tone ? toneText[tone] : "text-mut"}`}>{delta}</span>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-4 text-[12px] font-medium text-mut">
        <KindTag kind={kind} className="shrink-0" />
        <span className="leading-snug">{source}</span>
      </div>
      {fill !== null && (
        <div aria-hidden className="relative col-span-2 ml-4 mt-1 h-1.5 rounded-[3px] bg-white/[.08]">
          <i className={`absolute inset-y-0 left-0 rounded-[3px] ${dot[hue]}`} style={{ width: `${fill * 100}%` }} />
          <b className="absolute -top-[3px] h-3 w-0.5 rounded-[1px] bg-tx" style={{ left: `calc(${NORMAL_AT * 100}% - 1px)` }} />
        </div>
      )}
    </div>
  );
}
