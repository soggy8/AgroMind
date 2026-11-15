import { ChevronDown, Loader2, MessageSquareText, Plus, X } from "lucide-react";
import { useAssistant } from "./AssistantProvider";
import { ReportView } from "./ReportView";
import { Composer, IconButton, lastStatus, SUGGESTIONS, Thread } from "./Thread";
import { t as tr } from "../i18n";

/**
 * The assistant console, docked at the bottom of the map between the page's side panels, so both stay visible
 * while it changes them. Minimises to a pill; Ctrl/Cmd+K opens it from anywhere. On the Overview the page has the
 * full-size chat (AssistantChat) instead, showing the same conversation.
 */
export function AssistantPanel() {
  const a = useAssistant();
  const last = a.turns[a.turns.length - 1];
  const embedded = a.route === "overview";

  return (
    <>
      <style>{CSS}</style>
      {a.report !== null && <ReportView turn={a.turns.find((t) => t.id === a.report)} facts={a.facts} onClose={() => a.setReport(null)} />}
      {embedded ? null : !a.open ? (
        a.turns.length > 0 && (
          <button type="button" onClick={() => a.setOpen(true)} aria-label={tr("Open the assistant")}
            className="glass fixed bottom-4 left-1/2 z-[950] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 !rounded-full px-4 py-2.5 text-sm font-semibold print:hidden lg:bottom-5">
            {a.busy ? <Loader2 size={15} className="animate-spin text-lime" /> : <MessageSquareText size={15} strokeWidth={1.75} className="text-lime" />}
            <span className="truncate">{a.busy ? lastStatus(last) : tr("AgroMind assistant")}</span>
            <kbd className="hidden rounded-[5px] border border-line px-1.5 text-[11.5px] text-mut sm:inline">{tr("Ctrl K")}</kbd>
          </button>
        )
      ) : (
        <section role="region" aria-label={tr("AgroMind assistant")} onKeyDown={(e) => e.key === "Escape" && a.setOpen(false)}
          className="glass anim-in fixed inset-x-3 bottom-3 z-[950] flex max-h-[min(72svh,660px)] flex-col overflow-hidden print:hidden lg:inset-x-auto lg:bottom-5 lg:left-[390px] lg:right-[450px] lg:mx-auto lg:max-w-[620px]">
          <header className="flex items-center gap-2 border-b border-line py-2.5 pl-4 pr-2">
            <MessageSquareText size={17} strokeWidth={1.75} className="text-lime" />
            <h2 className="text-[15px] font-bold">{tr("AgroMind assistant")}</h2>
            <span className="ml-1 hidden text-[12px] text-mut sm:inline">{tr("tell it what to show or simulate")}</span>
            <div className="ml-auto flex items-center">
              {a.turns.length > 0 && (
                <IconButton label={tr("New conversation")} onClick={a.reset}><Plus size={17} strokeWidth={1.75} /></IconButton>
              )}
              <IconButton label={tr("Minimise")} onClick={() => a.setOpen(false)}><ChevronDown size={18} strokeWidth={1.75} /></IconButton>
              {a.turns.length === 0 && <IconButton label={tr("Close")} onClick={() => a.setOpen(false)}><X size={17} strokeWidth={1.75} /></IconButton>}
            </div>
          </header>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3" data-thread-scroll>
            {a.turns.length === 0 ? (
              <div>
                <p className="text-[13px] leading-normal text-mut">
                  {tr("Ask in your own words. It opens pages, sets dates and simulator settings, and runs simulations while you watch; every change is listed and can be undone. Answers come only from AgroMind's data, cited by number. It never saves farm changes without your confirmation.")}
                </p>
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <li key={s.prompt}>
                      <button type="button" onClick={() => a.ask(s.prompt)}
                        className="h-full w-full rounded-chip border border-line bg-glass-hi px-3 py-2 text-left text-[13px] hover:bg-glass-sel">
                        {tr(s.prompt)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <Thread size="dock" />}
          </div>
          <Composer size="dock" />
        </section>
      )}
    </>
  );
}

/**
 * Styles for what the assistant touches: the changed control's one-off lime outline, and the map field pulse
 * (FarmMap adds class "assist-pulse" to the outlines it is told to point at). Two pulses, then still (DESIGN.md 10).
 */
const CSS = `
[data-assist-flash] { outline: 2px solid var(--color-lime); outline-offset: 3px; border-radius: var(--radius-ctl);
  animation: assist-flash 1.8s ease-out both; }
@keyframes assist-flash { 0%, 55% { outline-color: var(--color-lime); } 100% { outline-color: transparent; } }
path.assist-pulse { stroke: var(--color-lime); animation: assist-pulse 900ms ease-in-out 2; }
@keyframes assist-pulse { 0%, 100% { stroke-width: 2.5px; } 50% { stroke-width: 7px; } }
@media (prefers-reduced-motion: reduce) {
  [data-assist-flash], path.assist-pulse { animation: none; }
}
`;
