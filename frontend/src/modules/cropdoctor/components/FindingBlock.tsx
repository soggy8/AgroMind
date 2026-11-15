import { CircleCheck } from "lucide-react";
import { Badge } from "../../../shared/components";
import { fmtDate } from "../lib/format";
import type { Finding } from "../types";
import { t } from "../../../shared/i18n";

/**
 * Finding block (DESIGN.md section 6): the top of the right panel, on a warm wash. Cautious wording
 * from the API, each possible explanation, then the recommended field checks and the caveat.
 */
export function FindingBlock({ finding }: { finding: Finding }) {
  return (
    <section aria-label={t("Finding")}
      className="-mx-[18px] -mt-[18px] rounded-t-panel border-b border-line bg-[linear-gradient(170deg,rgb(255_162_58/.26),rgb(255_90_78/.10)_55%,transparent)] px-[18px] pb-[18px] pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[21px] font-bold tracking-[-.01em]">{finding.headline}</h2>
        <Badge tone={finding.severity}>{finding.severity === "alert" ? t("Alert") : t("Watch")}</Badge>
      </div>
      <p className="mt-[3px] text-[13px] font-semibold text-watch">{t("{field_name} · since {fmtDate}", { field_name: finding.field_name, fmtDate: fmtDate(finding.since) })}</p>
      <p className="mt-2.5 text-sm leading-normal">{finding.summary}</p>
      {finding.explanations.map((e) => (
        <p key={e.id} className="mt-1.5 text-sm leading-normal">{t(e.text)}</p>
      ))}
      <div className="mt-3 border-t border-watch-fill/30 pt-3">
        <h3 className="text-[12px] font-bold uppercase tracking-[.05em] text-mut">{t("Recommended check")}</h3>
        <ul className="m-0 mt-1.5 list-none space-y-2 p-0">
          {finding.explanations.map((e) => (
            <li key={e.id} className="flex gap-2.5 text-sm font-semibold leading-[1.4]">
              <CircleCheck size={18} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-watch-fill" />
              {e.check}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[13px] leading-normal text-mut">{finding.caveat}</p>
    </section>
  );
}
