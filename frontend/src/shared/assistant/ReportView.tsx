import { FileText, Printer, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnswerText } from "./AnswerText";
import type { ChatTurn } from "./AssistantProvider";
import { formatDate, t } from "../i18n";

/**
 * The assistant's report as a printable page: its answer, then every fact it cited as the sources.
 * Printing shows only this page (the rest of the app is hidden while it is open).
 */
export function ReportView({ turn, facts, onClose }: { turn: ChatTurn | undefined; facts: string[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    document.body.dataset.assistReport = "open";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.assistReport;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!turn?.answer) return null;
  const cited = turn.answer.cited.filter((n) => facts[n - 1]);
  const date = formatDate(new Date(), { day: "numeric", month: "long", year: "numeric" });

  return createPortal(
    <div className="assist-report fixed inset-0 z-[1100] overflow-y-auto bg-black/60 p-4 sm:p-8 print:static print:bg-white print:p-0"
      role="dialog" aria-modal="true" aria-label={turn.report ?? t("Report")}>
      <style>{PRINT_CSS}</style>
      <div className="mx-auto mb-3 flex max-w-[800px] items-center justify-end gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
          <Printer size={15} strokeWidth={2} /> {t("Print or save as PDF")}
        </button>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t("Close report")}
          className="glass grid h-10 w-10 place-items-center !rounded-ctl"><X size={18} strokeWidth={1.75} /></button>
      </div>
      {/* Paper: printed black on white, like the Simulator's report. */}
      <article className="mx-auto max-w-[800px] rounded-[6px] bg-white p-8 text-[11pt] leading-snug text-black shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="mb-4 border-b border-black/20 pb-3">
          <p className="flex items-center gap-1.5 text-[9pt] font-semibold uppercase tracking-[.08em] text-black/60">
            <FileText size={12} /> {t("AgroMind report · {date}", { date })}
          </p>
          <h1 className="mt-1 text-[17pt] font-bold leading-tight">{turn.report}</h1>
        </header>
        <AnswerText text={turn.answer.text} print />
        {cited.length > 0 && (
          <section className="mt-6 border-t border-black/20 pt-3">
            <h2 className="text-[10pt] font-bold uppercase tracking-[.06em] text-black/70">{t("Sources")}</h2>
            <ol className="mt-1.5 space-y-1 text-[9pt] text-black/80">
              {cited.map((n) => <li key={n}><span className="font-bold">[{n}]</span> {facts[n - 1]}</li>)}
            </ol>
          </section>
        )}
        <footer className="mt-6 border-t border-black/20 pt-2 text-[8.5pt] text-black/60">
          {t("Written by the AgroMind assistant from AgroMind's data only. Observed values are measurements; Modelled values are estimates; a Scenario is a what-if, not a forecast.")}
          {!turn.answer.grounded && t(" Parts of this text cite no source: check them before relying on them.")}
        </footer>
      </article>
    </div>,
    document.body,
  );
}

/** While a report is open, printing shows only the report. */
const PRINT_CSS = `
@media print {
  body[data-assist-report] > *:not(.assist-report) { display: none !important; }
  body[data-assist-report] { background: white; }
}
`;
