import type { ReactNode } from "react";

/** The top bar's status pill (DESIGN.md section 6): tinted fill and border, a dot, and a word. */
export function StatusPill({ tone, children }: { tone: "watch" | "ok"; children: ReactNode }) {
  const cls = tone === "watch" ? "border-watch-fill/45 bg-watch-fill/12 text-watch" : "border-ok/40 bg-ok/10 text-ok";
  return (
    <span className={`flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-full border px-3 py-[7px] text-[13px] font-bold ${cls}`}>
      <i aria-hidden className={`h-2 w-2 rounded-full ${tone === "watch" ? "bg-watch-fill" : "bg-ok"}`} />
      <span>{children}</span>
    </span>
  );
}
