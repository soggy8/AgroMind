import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { t } from "../i18n";

export interface TourStep {
  target: string; // value of a data-tour attribute
  title: string;
  body: string;
}

const STORAGE_PREFIX = "agromind.tour.";

/** Has this tour been finished or dismissed in this browser? Storage may be blocked: then treat as unseen. */
export function tourSeen(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === "done";
  } catch {
    return false;
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, "done");
  } catch {
    /* fine */
  }
}

/** A short guided tour: dims the page, outlines one element at a time, explains it. Steps with no target are skipped. */
export function Tour({ id, steps, onClose }: { id: string; steps: TourStep[]; onClose: () => void }) {
  const available = steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = available[i];

  const finish = useCallback(() => {
    markSeen(id);
    onClose();
  }, [id, onClose]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: "nearest" });
    // Freeze the page where that step landed. A scroll moves the page and leaves the outline behind.
    const y = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    const update = () => setRect(el?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      window.scrollTo(0, y);
    };
  }, [step]);

  useEffect(() => {
    const blockScroll = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setI((x) => e.key === "ArrowRight" ? Math.min(x + 1, available.length - 1) : Math.max(x - 1, 0));
      }
      if (e.key === "PageDown" || e.key === "PageUp" || e.key === "Home" || e.key === "End") e.preventDefault();
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    };
    window.addEventListener("wheel", blockScroll, { passive: false });
    window.addEventListener("touchmove", blockScroll, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", blockScroll);
      window.removeEventListener("touchmove", blockScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish, available.length]);

  if (!step || !rect) return null;
  const pad = 6;
  const below = rect.bottom + 180 < window.innerHeight;
  const left = Math.min(Math.max(rect.left, 12), window.innerWidth - 332);
  const last = i === available.length - 1;

  return (
    <div className="fixed inset-0 z-[1100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="absolute rounded-[14px] outline outline-2 outline-lime transition-all duration-200"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / .55)" }} />
      <div className="glass anim-in absolute w-[320px] p-4" style={{ left, top: below ? rect.bottom + 14 : undefined, bottom: below ? undefined : window.innerHeight - rect.top + 14 }}>
        <div className="text-[12px] font-semibold text-mut">{t("Step {v} of {length}", { v: i + 1, length: available.length })}</div>
        <h2 id="tour-title" className="mt-1 text-[16px] font-bold">{t(step.title)}</h2>
        <p className="mt-1 text-[13px] leading-normal text-tx/90">{t(step.body)}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={finish} className="text-[13px] font-semibold text-mut hover:text-tx">{t("Skip tour")}</button>
          <div className="flex gap-2">
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded-ctl border border-line bg-glass-hi px-3 py-1.5 text-[13px] font-semibold">{t("Back")}</button>}
            <button type="button" autoFocus onClick={() => (last ? finish() : setI(i + 1))} className="btn-primary px-3 py-1.5 text-[13px]">
              {last ? t("Done") : t("Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
