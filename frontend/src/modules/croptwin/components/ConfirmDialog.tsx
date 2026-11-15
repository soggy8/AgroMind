/**
 * CropTwin: the in-app confirmation dialog. It replaces window.confirm, which blocks the page (and the Chrome test
 * extension) and can't be styled. FarmProfilePage wraps the page in ConfirmProvider once; components call useConfirm().
 * Used for deleting fields and farms, replacing soil layers with SoilGrids, and leaving with unsaved changes.
 */
import { AlertTriangle } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../../shared/components";
import { t } from "../../../shared/i18n";

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get a warning icon and alert-coloured confirm text. */
  danger?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask>(async () => false);

/** In-app confirmation, used instead of window.confirm (which blocks the page and isn't styled). */
export const useConfirm = () => useContext(ConfirmContext);

/** Holds the one dialog. Render it once around the page so useConfirm() works anywhere below. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const ask = useCallback<Ask>((o) => new Promise((resolve) => setReq({ ...o, resolve })), []);
  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {req && <ConfirmDialog {...req} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";

/** Glass dialog (DESIGN.md sections 3 and 8): traps focus, Escape cancels, focus returns where it was. */
function ConfirmDialog({ title, body, confirmLabel, cancelLabel = t("Cancel"), danger, onClose }:
  ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(); // the safe choice has focus first
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current(false);
      } else if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const [first, last] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/55 p-4" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose(false);
    }}>
      <div ref={box} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
        className="glass anim-in w-full max-w-[420px] p-5">
        <h2 id={titleId} className="flex items-center gap-2 text-[19px] font-bold tracking-[-.01em]">
          {danger && <AlertTriangle size={19} strokeWidth={1.75} className="shrink-0 text-alert" />}
          {title}
        </h2>
        <div id={bodyId} className="mt-2 space-y-2 text-sm leading-normal text-mut">{body}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button data-autofocus className="max-sm:min-h-11" onClick={() => onClose(false)}>{cancelLabel}</Button>
          <Button className={`max-sm:min-h-11 ${danger ? "!text-alert" : ""}`} onClick={() => onClose(true)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
