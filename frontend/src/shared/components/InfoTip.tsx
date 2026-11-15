import { Info } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { t } from "../i18n";

/** A small (i) button that explains a term in plain words. Click or keyboard to open; Esc or outside click closes. */
export function InfoTip({ label, children, align = "left" }: { label: string; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button type="button" aria-label={t("What is {label}?", { label })} aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="grid h-6 w-6 place-items-center rounded-full text-mut hover:bg-glass-hi hover:text-tx">
        <Info size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <span id={id} role="tooltip"
          className={`absolute top-7 z-50 w-64 rounded-chip border border-line bg-[rgb(16_20_18/.97)] p-3 text-left text-[13px] font-normal normal-case leading-snug tracking-normal text-tx shadow-[0_12px_30px_-8px_rgb(0_0_0/.6)] ${align === "right" ? "right-0" : "left-0"}`}>
          <span className="mb-1 block font-bold">{label}</span>
          {children}
        </span>
      )}
    </span>
  );
}
