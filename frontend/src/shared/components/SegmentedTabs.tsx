import type { ReactNode } from "react";
import { t } from "../i18n";

export interface Segment<T extends string> {
  id: T;
  label: ReactNode;
}

/** Segmented control: main nav, map layers, panel tabs (DESIGN.md section 6). */
export function SegmentedTabs<T extends string>({
  items, value, onChange, label, size = "md", className = "",
}: {
  items: Segment<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const pad = size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-sm";
  return (
    <div role="tablist" aria-label={label} className={`flex gap-0.5 rounded-[12px] bg-black/25 p-1 ${className}`}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            className={`flex-1 whitespace-nowrap rounded-[9px] font-semibold transition-colors ${pad} ${
              on ? "bg-glass-sel text-tx shadow-[inset_0_1px_0_rgb(255_255_255/.15)]" : "text-mut hover:text-tx"
            }`}
          >
            {typeof it.label === "string" ? t(it.label) : it.label}
          </button>
        );
      })}
    </div>
  );
}
