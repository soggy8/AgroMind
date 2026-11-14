import { MessageSquareText, X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Placeholder for the AI advisor: says plainly that it is not built yet. */
export function AdvisorDrawer({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="advisor-h" onClick={(e) => e.stopPropagation()}
        className="glass anim-in m-3 flex h-fit w-full max-w-[440px] flex-col overflow-hidden sm:m-5">
        <div className="flex items-center justify-between border-b border-line px-[18px] py-4">
          <h2 id="advisor-h" className="flex items-center gap-2 text-[16px] font-bold">
            <MessageSquareText size={18} strokeWidth={1.75} className="text-lime" /> Ask the advisor
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-[18px] py-4 text-sm">
          <p className="text-[15px] font-bold">Work in progress</p>
          <p className="mt-1 text-mut">The AI advisor isn&apos;t built yet.</p>
        </div>
      </aside>
    </div>
  );
}
