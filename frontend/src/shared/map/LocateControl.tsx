/**
 * Shared map control, added by CropTwin: the "Locate me" button under the zoom buttons. It only reports the click; the
 * page asks the browser for the location and moves the map.
 */
import L from "leaflet";
import { Loader2, LocateFixed } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { t } from "../i18n";

/** "Locate me": a glass map button under the zoom buttons (DESIGN.md sections 5 and 6). Render inside the map. */
export function LocateControl({ onLocate, busy, style }: { onLocate: () => void; busy: boolean; style: CSSProperties }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);
  return (
    <button ref={ref} type="button" aria-label={t("Show my location")} title={t("Show my location")} onClick={onLocate} disabled={busy}
      className="glass absolute z-[500] grid h-[38px] w-[38px] place-items-center !rounded-[12px] text-tx hover:bg-glass-hi max-sm:h-11 max-sm:w-11"
      style={style}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} strokeWidth={1.75} />}
    </button>
  );
}
