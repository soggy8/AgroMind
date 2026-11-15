import { t } from "../i18n";
export type ValueKind = "observed" | "modelled" | "scenario";

const hue: Record<ValueKind, string> = {
  observed: "text-rain bg-rain/12 border-rain/35",
  modelled: "text-soil bg-soil/12 border-soil/35",
  scenario: "text-water bg-water/12 border-water/35",
};

/** Every value's label: OBSERVED / MODELLED / SCENARIO (DESIGN.md sections 6 and 8). */
const KIND_LABEL: Record<ValueKind, string> = { observed: "OBSERVED", modelled: "MODELLED", scenario: "SCENARIO" };

export function KindTag({ kind, className = "" }: { kind: ValueKind; className?: string }) {
  return (
    <span className={`inline-block rounded-[6px] border px-[7px] py-[2px] text-[11.5px] font-extrabold uppercase tracking-[.05em] ${hue[kind]} ${className}`}>
      {t(KIND_LABEL[kind])}
    </span>
  );
}
