import { AlertTriangle, ArrowRight, ArrowUp, Check, FileText, Hourglass, Loader2, Send, Sprout, Square, Undo2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AnswerText } from "./AnswerText";
import { type ChatTurn, type Step, useAssistant } from "./AssistantProvider";
import { t as tr } from "../i18n";

/**
 * The conversation, shared by the docked console (AssistantPanel) and the Overview's full-page chat (AssistantChat):
 * one conversation, two sizes. `size="page"` is the roomier ChatGPT-style layout.
 */
export type ThreadSize = "dock" | "page";

export const SUGGESTIONS = [
  { title: tr("Replay a past season"), prompt: tr("Show me what happened on this farm in August 2012") },
  { title: tr("Try a climate what-if"), prompt: tr("Simulate 2 °C hotter and 20% less rain with full irrigation") },
  { title: tr("Check on my fields"), prompt: tr("Is anything on the farm unusual right now?") },
  { title: tr("Write a report"), prompt: tr("Write a one-page summary for my bank") },
];

export const CHIP = "inline-flex items-center gap-1.5 rounded-ctl border border-line bg-glass-hi px-2.5 py-1.5 text-[12.5px] font-semibold hover:bg-glass-sel";

/** Every turn, then the fact the farmer clicked and the full list of facts used. Scrolls to the newest. */
export function Thread({ size = "dock" }: { size?: ThreadSize }) {
  const a = useAssistant();
  const [fact, setFact] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Keep the newest turn in view by scrolling the thread's own box (data-thread-scroll), never the page.
  useEffect(() => {
    const box = endRef.current?.closest<HTMLElement>("[data-thread-scroll]");
    if (box) box.scrollTop = box.scrollHeight;
  }, [a.turns, a.facts.length]);
  const small = size === "dock";
  return (
    <div aria-live="polite">
      <div className={small ? "space-y-4" : "space-y-7"}>
        {a.turns.map((t) => <TurnView key={t.id} turn={t} onCite={setFact} size={size} />)}
      </div>
      {fact !== null && a.facts[fact - 1] && (
        <div role="note" className="mt-3 flex gap-2 rounded-chip border border-line bg-glass-hi px-3 py-2 text-[12.5px] leading-normal">
          <span className="font-bold text-mut">[{fact}]</span>
          <span className="flex-1">{a.facts[fact - 1]}</span>
          <button type="button" onClick={() => setFact(null)} aria-label={tr("Close fact")} className="text-mut hover:text-tx"><X size={14} /></button>
        </div>
      )}
      {a.facts.length > 0 && (
        <details className="mt-4 border-t border-line pt-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-mut">{tr("The facts it has used ({length})", { length: a.facts.length })}</summary>
          <ol className="mt-2 space-y-1.5">
            {a.facts.map((f, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-normal text-tx/90">
                <span className="w-7 shrink-0 font-bold text-mut">[{i + 1}]</span>{f}
              </li>
            ))}
          </ol>
        </details>
      )}
      <div ref={endRef} />
    </div>
  );
}

/** The question box. Focuses when the assistant is summoned (top bar button, Ctrl/Cmd+K). */
export function Composer({ size = "dock", autoFocus = true }: { size?: ThreadSize; autoFocus?: boolean }) {
  const a = useAssistant();
  const [question, setQuestion] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const page = size === "page";

  // Focus on mount when asked to, and whenever the assistant is summoned after that (focus scrolls it into view).
  const seen = useRef(a.focusKey);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    if (a.focusKey === seen.current) return;
    seen.current = a.focusKey;
    ref.current?.focus();
  }, [a.focusKey]);
  // The page composer grows with the text, up to six lines.
  useEffect(() => {
    const el = ref.current;
    if (!el || !page) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [question, page]);

  const send = () => {
    if (!question.trim() || a.busy) return;
    a.ask(question);
    setQuestion("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <form onSubmit={submit} className={page
      ? "flex items-end gap-2 rounded-[18px] border border-line bg-glass-hi p-2 pl-4 focus-within:border-lime/50"
      : "flex gap-2 border-t border-line p-2.5"}>
      <label htmlFor={`assistant-q-${size}`} className="sr-only">{tr("Ask the assistant")}</label>
      <textarea id={`assistant-q-${size}`} ref={ref} rows={1} value={question} maxLength={2000} autoComplete="off"
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={a.busy ? tr("Working…") : page ? tr("Ask AgroMind to show, explain or simulate anything on your farm…") : tr("e.g. show me March 2016, or make it 2 °C hotter")}
        className={page
          ? "min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15.5px] leading-normal outline-none placeholder:text-mut/70 focus-visible:outline-none"
          : "min-w-0 flex-1 resize-none rounded-ctl border border-line bg-glass-hi px-3 py-2.5 text-sm placeholder:text-mut/70"} />
      {a.busy ? (
        <button type="button" onClick={a.stop} aria-label={tr("Stop")}
          className={`grid shrink-0 place-items-center rounded-ctl border border-line bg-glass-hi hover:bg-glass-sel ${page ? "h-11 w-11 !rounded-full" : "w-11"}`}>
          <Square size={14} strokeWidth={2} />
        </button>
      ) : (
        <button type="submit" disabled={!question.trim()} aria-label={tr("Send")}
          className={`btn-primary grid shrink-0 place-items-center disabled:opacity-50 ${page ? "h-11 w-11 !rounded-full" : "w-11"}`}>
          {page ? <ArrowUp size={19} strokeWidth={2.25} /> : <Send size={16} strokeWidth={2} />}
        </button>
      )}
    </form>
  );
}

function TurnView({ turn: t, onCite, size }: { turn: ChatTurn; onCite: (n: number) => void; size: ThreadSize }) {
  const a = useAssistant();
  const page = size === "page";
  const lastStatusIndex = t.steps.map((s) => s.kind).lastIndexOf("status");
  const body = (
    <div className="min-w-0 flex-1 space-y-2">
      {t.steps.length > 0 && (
        <ol className="space-y-1" aria-label={tr("What the assistant did")}>
          {t.steps.map((s, i) => <StepView key={i} step={s} running={t.busy && i === lastStatusIndex && !t.answer} turnId={t.id} />)}
        </ol>
      )}
      {t.busy && !t.answer && t.steps.length === 0 && (
        <p className="flex items-center gap-2 text-[13px] text-mut" role="status"><Loader2 size={14} className="animate-spin" /> {tr("Thinking…")}</p>
      )}
      {t.answer && (
        <div className={page ? "text-[15px] leading-relaxed [&_.text-sm]:text-[15px]" : undefined}>
          <AnswerText text={t.answer.text} onCite={onCite} />
          {!t.answer.grounded && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-watch">
              <AlertTriangle size={13} /> {tr("This answer doesn't cite AgroMind's facts. Treat it with care.")}
            </p>
          )}
        </div>
      )}
      {t.error && (
        <p role="alert" className="rounded-chip border border-watch/40 bg-watch/10 px-3 py-2 text-[13px] text-watch">{t.error}</p>
      )}
      {!t.busy && (t.report || (t.undo && !t.undone) || t.undone) && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {t.report && t.answer && (
            <button type="button" onClick={() => a.setReport(t.id)} className={CHIP}><FileText size={13} strokeWidth={1.75} /> {tr("Open report")}</button>
          )}
          {t.undo && !t.undone && (
            <button type="button" onClick={() => a.undo(t.id)} className={CHIP}><Undo2 size={13} strokeWidth={1.75} /> {tr("Undo these changes")}</button>
          )}
          {t.undone && <span className="text-[12px] text-mut">{tr("Changes undone.")}</span>}
        </div>
      )}
    </div>
  );
  return (
    <article className="space-y-2">
      <p className={`ml-auto w-fit max-w-[85%] whitespace-pre-wrap bg-glass-sel ${page ? "rounded-[18px] px-4 py-2.5 text-[15px]" : "rounded-chip px-3 py-2 text-sm"}`}>
        {tr(t.question)}
      </p>
      {page ? (
        <div className="flex gap-3 pt-1">
          <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-glass-hi">
            <Sprout size={16} strokeWidth={1.75} className="text-lime" />
          </span>
          {body}
        </div>
      ) : body}
    </article>
  );
}

function StepView({ step: s, running, turnId }: { step: Step; running: boolean; turnId: number }) {
  const a = useAssistant();
  if (s.kind === "status") {
    return (
      <li className="flex items-center gap-2 text-[12.5px] text-mut">
        {running ? <Loader2 size={13} className="shrink-0 animate-spin text-lime" /> : <Check size={13} strokeWidth={2} className="shrink-0 text-ok" />}
        {tr(s.text)}
      </li>
    );
  }
  if (s.kind === "waiting") {
    return (
      <li className="flex items-center gap-2 text-[12.5px] text-mut" role="status">
        <Hourglass size={13} strokeWidth={1.75} className="shrink-0 text-watch" />
        {tr("Waiting for the free AI quota, about {ceil} s…", { ceil: Math.ceil(s.seconds) })}
      </li>
    );
  }
  if (s.kind === "change") {
    return (
      <li className="flex flex-wrap items-center gap-x-2 pl-[21px] text-[12.5px]">
        <span className="font-semibold">{tr(s.label)}</span>
        {(s.before !== undefined || s.after !== undefined) && (
          <span className="flex items-center gap-1.5 text-mut">
            {s.before !== undefined && <span className="line-through decoration-mut/60">{s.before}</span>}
            <ArrowRight size={12} className="text-lime" aria-label="to" />
            <span className="font-semibold text-tx">{s.after}</span>
          </span>
        )}
      </li>
    );
  }
  // A proposed farm change: nothing is saved until the farmer confirms.
  return (
    <li className="my-1.5 rounded-chip border border-line bg-glass-hi px-3 py-2.5">
      <p className="text-[13px] font-bold">{tr(s.title)}</p>
      <ul className="mt-1 space-y-0.5 text-[12.5px]">{s.summary.map((line) => <li key={line}>{line}</li>)}</ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {s.status === "pending" && (
          <>
            <button type="button" onClick={() => a.decide(turnId, s.id, true)}
              className="rounded-ctl bg-lime px-3 py-1.5 text-[12.5px] font-bold text-lime-ink hover:brightness-105">
              {s.change.kind === "draw_new_field" ? tr("Start drawing") : tr("Confirm and save")}
            </button>
            <button type="button" onClick={() => a.decide(turnId, s.id, false)} className={CHIP}>{tr("Dismiss")}</button>
            <span className="text-[12px] text-mut">{tr("Not saved yet.")}</span>
          </>
        )}
        {s.status === "saving" && <span className="flex items-center gap-1.5 text-[12.5px] text-mut"><Loader2 size={13} className="animate-spin" /> {tr("Saving…")}</span>}
        {s.status === "saved" && <span className="flex items-center gap-1.5 text-[12.5px] text-ok"><Check size={13} strokeWidth={2} /> {s.note ?? tr("Saved.")}</span>}
        {s.status === "dismissed" && <span className="text-[12.5px] text-mut">{tr("Dismissed. Nothing changed.")}</span>}
        {s.status === "failed" && <span role="alert" className="text-[12.5px] text-watch">{tr("Not saved:")} {s.note}</span>}
      </div>
    </li>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
      {children}
    </button>
  );
}

export function lastStatus(t: ChatTurn | undefined): string {
  const s = [...(t?.steps ?? [])].reverse().find((x) => x.kind === "status" || x.kind === "waiting");
  if (!s) return tr("Thinking…");
  return s.kind === "status" ? `${s.text}…` : tr("Waiting for the free AI quota…");
}
