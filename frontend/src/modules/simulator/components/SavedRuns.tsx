import { Columns2, FolderOpen, Lock, Save, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAuth } from "../../../app/auth";
import { useFarmChoice } from "../../../app/farm";
import { Button } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { signed } from "../lib/format";
import type { SavedRunSummary } from "../types";
import { formatDate, t } from "../../../shared/i18n";

/** Save the current set-up and result; reopen, compare or delete earlier runs. */
export function SavedRuns({ runs, error, canSave, defaultName, onSave, onOpen, onDelete, onCompare }: {
  runs: SavedRunSummary[];
  error: string | null;
  canSave: boolean;
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCompare: (ids: [string, string]) => void;
}) {
  const u = useUnits();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // The demo farm is read-only (backend app/access.py): runs can be made and compared, not saved.
  const { farms, selectedId } = useFarmChoice();
  const auth = useAuth();
  const readOnly = !!farms?.find((f) => f.id === selectedId)?.public;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      await onSave(name.trim() || defaultName);
      setName("");
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));

  const summary = (r: SavedRunSummary) => {
    const s = r.scenario;
    const climate = s.projection ? `NASA ${s.projection.replace("_", " ").replace("ssp245", "SSP2-4.5").replace("ssp585", "SSP5-8.5")}`
      : `${u.tempDelta(s.temp_delta_c)} · ${t("{v}% rain", { v: signed(s.rain_change_pct) })}`;
    return `${climate} · ${s.irrigation === "none" ? t("rain-fed") : s.irrigation === "full" ? t("full irrigation") : t("limited irrigation")} · ${t("{n} yr", { n: s.years })}`;
  };

  return (
    <section aria-labelledby="saved-h">
      <h3 id="saved-h" className="text-[15px] font-bold">{t("Saved runs")}</h3>
      {readOnly ? (
        <div className="mt-2 rounded-chip border border-line px-3 py-2.5 text-[13px] leading-snug">
          <p className="flex items-center gap-2 font-medium"><Lock size={14} strokeWidth={1.5} className="shrink-0 text-mut" /> {t("The demo farm is read-only")}</p>
          <p className="mt-1 text-mut">
            {auth.user ? t("Add a farm of your own in the Farm profile to save runs.") : t("Create a free account and add your farm to save runs.")}
          </p>
          {!auth.user && (
            <Button className="mt-2 max-sm:min-h-11" onClick={() => auth.openAuth({ mode: "signup" })}>{t("Create an account")}</Button>
          )}
        </div>
      ) : <>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor="run-name">{t("Name for this run")}</label>
        <input id="run-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} maxLength={80}
          disabled={!canSave}
          className="min-w-0 flex-1 rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm placeholder:text-mut/70 disabled:opacity-50" />
        <Button type="submit" disabled={!canSave || busy}>
          <Save size={15} strokeWidth={1.75} /> {t("Save")}
        </Button>
      </form>
      {!canSave && <p className="mt-1.5 text-[12px] text-mut">{t("Run the simulation first; saving stores the inputs and the result.")}</p>}
      </>}
      {(saveError || error) && <p role="alert" className="mt-1.5 text-[13px] text-alert">{saveError ?? error}</p>}
      {runs.length === 0 ? (
        <p className="mt-3 text-[13px] text-mut">{t("No saved runs yet.")}</p>
      ) : (
        <>
          {runs.length > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-chip bg-glass-hi px-3 py-2 text-[12px] text-mut">
              <span>{t("Tick two runs to compare them side by side.")}</span>
              <button type="button" disabled={picked.length !== 2} onClick={() => onCompare(picked as [string, string])}
                className="inline-flex shrink-0 items-center gap-1 rounded-ctl border border-line px-2 py-1 font-semibold text-tx hover:bg-glass-sel disabled:opacity-45">
                <Columns2 size={13} /> {t("Compare")}
              </button>
            </div>
          )}
          <ul className="mt-1">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center gap-2 border-b border-line py-2.5 last:border-0">
                {runs.length > 1 && (
                  <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)}
                    aria-label={t("Select {name} to compare", { name: r.name })} className="h-4 w-4 shrink-0 accent-[var(--color-lime)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.name}</div>
                  <div className="truncate text-[12px] text-mut">{summary(r)}</div>
                  <div className="truncate text-[12px] text-mut">{t("Top: {recommended_rotation} · {toLocaleDateString}", { recommended_rotation: r.recommended_rotation, toLocaleDateString: formatDate(new Date(r.created_at), { day: "numeric", month: "short", year: "numeric" }) })}</div>
                </div>
                <button type="button" onClick={() => onOpen(r.id)} aria-label={t("Open {name}", { name: r.name })}
                  className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
                  <FolderOpen size={16} strokeWidth={1.75} />
                </button>
                <button type="button" onClick={() => onDelete(r.id)} aria-label={t("Delete {name}", { name: r.name })}
                  className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-alert">
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
