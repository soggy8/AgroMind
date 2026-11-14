import type { ReactNode } from "react";

const tones = {
  watch: "bg-watch-fill text-ground",
  alert: "bg-alert text-ground",
  ok: "bg-ok text-ground",
  muted: "bg-glass-sel text-mut",
} as const;

/** Severity pill (DESIGN.md section 6). Always carries a word, never colour alone. */
export function Badge({ tone, children }: { tone: "watch" | "alert" | "ok" | "muted"; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[12px] font-extrabold ${tones[tone]}`}>
      {children}
    </span>
  );
}
