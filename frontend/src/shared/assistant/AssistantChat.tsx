import { ArrowUpRight, Plus, Sprout } from "lucide-react";
import { useAssistant } from "./AssistantProvider";
import { Composer, IconButton, SUGGESTIONS, Thread } from "./Thread";
import { t } from "../i18n";

/**
 * The assistant as a full-size chat, ChatGPT style, for the Overview. Same conversation as the docked console on
 * the other pages: when an answer needs a page (a date in the Command Center, a simulation), the assistant opens
 * that page and the conversation carries on there; coming back here shows the whole thread.
 */
export function AssistantChat({ farmName }: { farmName?: string }) {
  const a = useAssistant();
  const empty = a.turns.length === 0;

  return (
    <section aria-label={t("Ask AgroMind")} data-tour="ov-ask" className="glass anim-in overflow-hidden">
      {empty ? (
        <div className="mx-auto max-w-[780px] px-5 pb-8 pt-10 sm:px-8 sm:pt-14">
          <div className="text-center">
            <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-line bg-glass-hi">
              <Sprout size={22} strokeWidth={1.75} className="text-lime" />
            </span>
            <h2 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-.02em] sm:text-[32px]">
              {t("What should we look at")}{farmName ? t(" on {farmName}", { farmName }) : ""}?
            </h2>
            <p className="mx-auto mt-2 max-w-[600px] text-[14.5px] leading-relaxed text-mut">
              {t("Ask in your own words. AgroMind opens the right page, changes the settings while you watch, and answers only from its own data. Every change can be undone, and farm changes wait for your confirmation.")}
            </p>
          </div>
          <div className="mt-7"><Composer size="page" autoFocus={false} /></div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <li key={s.prompt}>
                <button type="button" onClick={() => a.ask(s.prompt)}
                  className="group flex h-full w-full items-start gap-3 rounded-[14px] border border-line bg-glass-hi px-4 py-3 text-left hover:bg-glass-sel">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold">{t(s.title)}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-mut">{t(s.prompt)}</span>
                  </span>
                  <ArrowUpRight size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mut group-hover:text-lime" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-[12px] text-mut">
            {t("Press")} <kbd className="rounded-[5px] border border-line px-1.5">{t("Ctrl K")}</kbd> {t("on any page to ask from there.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          <header className="flex items-center gap-2 border-b border-line py-2.5 pl-5 pr-2">
            <Sprout size={17} strokeWidth={1.75} className="text-lime" />
            <h2 className="text-[15px] font-bold">{t("Ask AgroMind")}</h2>
            <span className="ml-1 hidden text-[12px] text-mut sm:inline">{t("the conversation follows you to every page")}</span>
            <div className="ml-auto">
              <IconButton label={t("New conversation")} onClick={a.reset}><Plus size={17} strokeWidth={1.75} /></IconButton>
            </div>
          </header>
          <div className="scroll-thin max-h-[min(62svh,620px)] min-h-[240px] overflow-y-auto px-5 py-6 sm:px-8" data-thread-scroll>
            <div className="mx-auto max-w-[780px]"><Thread size="page" /></div>
          </div>
          <div className="border-t border-line px-4 py-3 sm:px-8">
            <div className="mx-auto max-w-[780px]"><Composer size="page" autoFocus={false} /></div>
          </div>
        </div>
      )}
    </section>
  );
}
