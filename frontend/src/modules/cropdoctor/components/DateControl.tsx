import { History } from "lucide-react";
import { fmtDate } from "../lib/format";
import type { FarmHealth } from "../types";
import { t } from "../../../shared/i18n";

const quick = "h-9 rounded-ctl border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors";

/** "Replay · as of 12 Aug 2012": shown on the map whenever the farm is shown for a past date. */
export function ReplayPill({ asOf }: { asOf: string }) {
  return (
    <div className="glass flex items-center gap-2 whitespace-nowrap !rounded-full px-3.5 py-2 text-[13px] font-bold">
      <History size={15} strokeWidth={1.75} aria-hidden className="text-lime" />
      <span>{t("Replay · as of {fmtDate}", { fmtDate: fmtDate(asOf) })}</span>
    </div>
  );
}

/** Date control for the top bar: the 2012 replay, Today, or any past date. A replay always shows its date in a `ReplayPill`. */
export function DateControl({ health, onPick }: { health: FarmHealth; onPick: (date: string) => void }) {
  const onReplay = health.replay_date !== null && health.as_of === health.replay_date;
  const onToday = health.as_of === health.today;
  const tone = (on: boolean) => (on ? "border-line bg-glass-sel text-tx" : "border-transparent text-mut hover:bg-glass-hi hover:text-tx");
  return (
    <div className="flex items-center gap-1.5">
      {health.replay_date && (
        <button type="button" aria-pressed={onReplay} onClick={() => onPick(health.replay_date!)} className={`${quick} ${tone(onReplay)}`}>
          {t("2012 drought")}
        </button>
      )}
      <button type="button" aria-pressed={onToday} onClick={() => onPick(health.today)} className={`${quick} ${tone(onToday)}`}>
        {t("Today")}
      </button>
      <input type="date" key={health.as_of} defaultValue={health.as_of} max={health.today} aria-label={t("Show the farm as of")}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= health.today) onPick(v);
        }}
        className="h-9 rounded-ctl border border-line bg-glass-hi px-2.5 text-[13px] font-semibold text-tx [color-scheme:dark]" />
    </div>
  );
}
