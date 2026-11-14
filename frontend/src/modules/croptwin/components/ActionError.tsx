/**
 * CropTwin: one inline error line inside a panel section (soil, crop history, new farm), so an error appears next to
 * the action that caused it instead of somewhere else on the page.
 */
import { AlertTriangle } from "lucide-react";

/** An error from an action in one panel section, shown inside that section. */
export function ActionError({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-2 flex gap-2 text-[13px] leading-snug text-alert">
      <AlertTriangle size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" /> {text}
    </p>
  );
}
