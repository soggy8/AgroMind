import { AlertTriangle, Loader2, MessageSquareText, Send } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Drawer } from "../../../shared/components";
import { simulatorApi } from "../api/simulatorApi";
import type { AdvisorAnswer, AdvisorContext, AdvisorTurn, SimulationResult } from "../types";

interface ChatTurn extends AdvisorTurn {
  cited?: number[];
  grounded?: boolean;
}

/**
 * AI advisor chat. It may only use the numbered facts built from the current result
 * (simulator advisor-context), and cites them; answers that cite nothing are flagged.
 */
export function AdvisorDrawer({ farmId, result, onClose }: { farmId: string; result: SimulationResult | null; onClose: () => void }) {
  const [ctx, setCtx] = useState<AdvisorContext | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result) return;
    simulatorApi.advisorContext(farmId, result).then(setCtx).catch((e: Error) => setError(e.message));
  }, [farmId, result]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns, busy]);

  const ask = async (q: string) => {
    if (!ctx || !q.trim() || busy) return;
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: q.trim() }]);
    setQuestion("");
    setBusy(true);
    setError(null);
    try {
      const a: AdvisorAnswer = await simulatorApi.ask(ctx.facts, ctx.instructions, q.trim(), history);
      setTurns((t) => [...t, { role: "assistant", content: a.answer, cited: a.cited_facts, grounded: a.grounded }]);
    } catch (e) {
      setError((e as Error).message);
      setTurns((t) => t.slice(0, -1));
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <Drawer title="Ask the advisor" icon={<MessageSquareText size={18} strokeWidth={1.75} className="text-lime" />} onClose={onClose} width={480}
      footer={result && (
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="advisor-q" className="sr-only">Your question</label>
          <input id="advisor-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000}
            placeholder="Ask about these results…" disabled={!ctx || busy}
            className="min-w-0 flex-1 rounded-ctl border border-line bg-glass-hi px-3 py-2.5 text-sm placeholder:text-mut/70" />
          <button type="submit" disabled={!ctx || busy || !question.trim()} aria-label="Send"
            className="btn-primary grid w-11 place-items-center disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2} />}
          </button>
        </form>
      )}>
      {!result && <p className="text-mut">Run a simulation first: the advisor explains results, it doesn't produce them.</p>}
      {result && (
        <>
          <p className="text-[13px] leading-normal text-mut">
            Answers come only from the {ctx?.facts.length ?? "…"} facts in this result, cited by number. It won't invent
            yields, prices or research.
          </p>

          {turns.length === 0 && ctx && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {ctx.suggested_questions.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => void ask(q)}
                    className="w-full rounded-chip border border-line bg-glass-hi px-3 py-2 text-left text-[13px] hover:bg-glass-sel">
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-3" aria-live="polite">
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "ml-8 rounded-chip bg-glass-sel px-3 py-2" : "mr-2"}>
                <p className="whitespace-pre-wrap text-sm leading-normal">{t.content}</p>
                {t.role === "assistant" && t.grounded === false && (
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-watch">
                    <AlertTriangle size={13} /> This answer doesn't cite the facts. Treat it with care.
                  </p>
                )}
                {t.role === "assistant" && !!t.cited?.length && (
                  <button type="button" onClick={() => setShowFacts(true)} className="mt-1 text-[12px] text-mut underline-offset-2 hover:underline">
                    Based on facts {t.cited.join(", ")}
                  </button>
                )}
              </div>
            ))}
            {busy && <p className="flex items-center gap-2 text-[13px] text-mut" role="status"><Loader2 size={14} className="animate-spin" /> Thinking…</p>}
            {error && <p role="alert" className="rounded-chip border border-watch/40 bg-watch/10 px-3 py-2 text-[13px] text-watch">{error}</p>}
            <div ref={endRef} />
          </div>

          {ctx && (
            <details className="mt-4 border-t border-line pt-3" open={showFacts} onToggle={(e) => setShowFacts((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer text-[13px] font-semibold text-mut">The facts it may use ({ctx.facts.length})</summary>
              <ol className="mt-2 space-y-2">
                {ctx.facts.map((f, i) => (
                  <li key={i} className="flex gap-2 border-b border-line pb-2 text-[12.5px] leading-normal text-tx/90 last:border-0">
                    <span className="w-6 shrink-0 font-bold text-mut">[{i + 1}]</span>{f}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </Drawer>
  );
}
