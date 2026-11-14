import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/** Glass side panel over the page (DESIGN.md: glass on the map, never glass on glass). Esc or backdrop closes. */
export function Drawer({ title, icon, onClose, children, width = 460, footer }: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/30" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="glass anim-in m-3 flex w-full flex-col overflow-hidden sm:m-5" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-[18px] py-4">
          <h2 className="flex items-center gap-2 text-[16px] font-bold">{icon}{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-[18px] py-4 text-sm">{children}</div>
        {footer && <div className="border-t border-line px-[18px] py-3">{footer}</div>}
      </div>
    </div>
  );
}
