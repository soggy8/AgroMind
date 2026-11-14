import { MessageSquareText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { simulatorApi } from "../api/simulatorApi";
import type { AdvisorContext, SimulationResult } from "../types";

/**
 * Hand-off to the AI advisor (shared/advisor, another teammate's module). Shows exactly what the
 * advisor will be allowed to use: the facts from this result and nothing else.
 */
export function AdvisorDrawer({ farmId, result, onClose }: { farmId: string; result: SimulationResult | null; onClose: () => void }) {
  const [ctx, setCtx] = useState<AdvisorContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!result) return;
    simulatorApi.advisorContext(farmId, result).then(setCtx).catch((e: Error) => setError(e.message));
  }, [farmId, result]);

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="advisor-h" onClick={(e) => e.stopPropagation()}
        className="glass anim-in m-3 flex w-full max-w-[440px] flex-col overflow-hidden sm:m-5">
        <div className="flex items-center justify-between border-b border-line px-[18px] py-4">
          <h2 id="advisor-h" className="flex items-center gap-2 text-[16px] font-bold">
            <MessageSquareText size={18} strokeWidth={1.75} className="text-lime" /> Ask the advisor
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-[18px] py-4 text-sm">
          <p className="rounded-chip border border-watch/40 bg-watch/10 px-3 py-2 text-[13px] leading-snug text-watch">
            The AI advisor isn&apos;t connected yet. When it is, it will answer from the facts below and nothing else.
          </p>
          {!result && <p className="mt-4 text-mut">Run a simulation first: the advisor explains results, it doesn&apos;t produce them.</p>}
          {error && <p role="alert" className="mt-4 text-alert">{error}</p>}
          {ctx && (
            <>
              <h3 className="mt-4 text-[15px] font-bold">Questions it can answer</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {ctx.suggested_questions.map((q) => (
                  <li key={q} className="rounded-chip border border-line bg-glass-hi px-2.5 py-1.5 text-[13px]">{q}</li>
                ))}
              </ul>
              <h3 className="mt-5 text-[15px] font-bold">Facts it may use</h3>
              <ol className="mt-2 space-y-2">
                {ctx.facts.map((f, i) => (
                  <li key={i} className="border-b border-line pb-2 text-[13px] leading-normal text-tx/90 last:border-0">{f}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
