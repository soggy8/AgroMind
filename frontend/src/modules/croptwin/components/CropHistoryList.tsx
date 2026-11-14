/**
 * CropTwin: a field's previous crops (season, crop, optional yield). Adding and deleting save straight away through
 * useFarmProfile (not with "Save farm"), so they need a saved field. Yields are only what the farmer typed: labelled
 * OBSERVED with source "Farmer-provided"; nothing is estimated. Crop ids come from types.ts CROPS, which must match
 * the backend CropId in schemas.py.
 */
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, KindTag } from "../../../shared/components";
import { cropName, type FieldDraft } from "../lib/draft";
import type { FarmProfile } from "../state/useFarmProfile";
import { CROPS, type CropId } from "../types";
import { ActionError } from "./ActionError";
import { inputCls, metaCls, sectionTitle } from "./form";

const UNITS = ["t/ha", "bu/ac"];

/** Previous crops on the field. Yields are only what the farmer reports; nothing is estimated here. */
export function CropHistoryList({ p, d }: { p: FarmProfile; d: FieldDraft }) {
  const history = p.savedField(d.id)?.crop_history ?? [];
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [crop, setCrop] = useState<CropId>("maize");
  const [yieldValue, setYieldValue] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [error, setError] = useState<string | null>(null);
  const busy = p.busy === "history";

  const add = async () => {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      setError("Enter the season as a year, for example 2025.");
      return;
    }
    const yv = yieldValue.trim() ? Number(yieldValue) : null;
    if (yv !== null && (!Number.isFinite(yv) || yv < 0)) {
      setError("Yield must be a number of 0 or more, or empty if you don't know it.");
      return;
    }
    setError(null);
    const ok = await p.actions.addCropHistory(d.id, {
      season_year: y, crop_id: crop, yield_value: yv, yield_unit: yv === null ? null : unit,
    });
    if (ok) setYieldValue("");
  };

  return (
    <section aria-labelledby="history-h">
      <h2 id="history-h" className={`mb-1 ${sectionTitle}`}>Crop history</h2>
      <p className={`mb-2 ${metaCls}`}>
        {d.isNew ? "Save the farm first, then add this field's previous crops." : "Saved as soon as you add or remove an entry."}
      </p>
      {history.length > 0 ? (
        <ul className="mb-2 divide-y divide-line">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 text-sm">
                <span className="font-bold">{h.season_year}</span> · {cropName(h.crop_id)}
                {h.yield_value !== null && (
                  <span className="ml-2 inline-flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{h.yield_value} {h.yield_unit}</span>
                    <KindTag kind="observed" />
                    <span className="text-[12px] text-mut">{h.source}</span>
                  </span>
                )}
                {h.yield_value === null && <span className="ml-2 text-[12px] text-mut">{h.source} · no yield given</span>}
              </span>
              <button type="button" aria-label={`Remove ${h.season_year} ${cropName(h.crop_id)}`} disabled={busy}
                onClick={() => void p.actions.deleteCropHistory(d.id, h.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-mut hover:bg-glass-hi hover:text-tx disabled:opacity-50 max-sm:h-11 max-sm:w-11">
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !d.isNew && <p className="mb-2 text-sm text-mut">No previous crops recorded.</p>
      )}
      {!d.isNew && (
        <fieldset className="grid grid-cols-[72px_1fr] gap-2" disabled={busy}>
          <legend className="sr-only">Add a previous crop</legend>
          <label className="block">
            <span className="mb-0.5 block text-[12px] text-mut">Season</span>
            <input inputMode="numeric" className={`${inputCls} !px-2 !py-1.5`} value={year} onChange={(e) => setYear(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[12px] text-mut">Crop</span>
            <select className={`${inputCls} !py-1.5`} value={crop} onChange={(e) => setCrop(e.target.value as CropId)}>
              {CROPS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[12px] text-mut">Yield</span>
            <input inputMode="decimal" placeholder="Optional" className={`${inputCls} !px-2 !py-1.5`} value={yieldValue}
              onChange={(e) => setYieldValue(e.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-0.5 block text-[12px] text-mut">Unit</span>
              <select className={`${inputCls} !py-1.5`} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </label>
            <Button className="max-sm:min-h-11" onClick={() => void add()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={1.75} />} Add
            </Button>
          </div>
        </fieldset>
      )}
      {error && <p role="alert" className="mt-1 text-[12px] text-alert">{error}</p>}
      <ActionError text={p.fieldError?.kind === "history" ? p.fieldError.text : null} />
    </section>
  );
}
