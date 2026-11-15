import { NDVI_BG, type NdviStep } from "./ndvi";
import { t as tr } from "../i18n";

/**
 * Weekly strip (DESIGN.md section 6): one rounded segment per period, coloured by greenness
 * against normal on the NDVI scale; a month axis below. Segments without a comparison stay grey.
 */
export function WeeklyStrip({ label, segments, ticks, range }: {
  label: string;
  segments: { key: string; step: NdviStep | null; title: string }[];
  ticks: { index: number; label: string }[];
  range?: string;
}) {
  const n = Math.max(segments.length, 1);
  return (
    <figure className="m-0">
      <figcaption className="mb-[9px] flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] font-bold">
        {label}
        {range && <span className="font-medium text-mut">{range}</span>}
      </figcaption>
      <ol className="m-0 flex h-3 list-none gap-[3px] p-0">
        {segments.map((s) => (
          <li key={s.key} title={s.title} className={`flex-1 rounded-[3px] ${s.step === null ? "bg-white/[.08]" : NDVI_BG[s.step]}`}>
            <span className="sr-only">{tr(s.title)}</span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="relative mt-[7px] h-4 text-[12px] text-mut">
        {ticks.map((t) => (
          <span key={t.index} className="absolute" style={{ left: `${(t.index / n) * 100}%` }}>{tr(t.label)}</span>
        ))}
      </div>
    </figure>
  );
}
