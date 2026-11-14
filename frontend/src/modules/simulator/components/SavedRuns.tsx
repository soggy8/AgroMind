import { FolderOpen, Save, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "../../../shared/components";
import { scenarioSummary } from "../lib/format";
import type { SavedRunSummary } from "../types";

/** Save the current set-up and result; reopen or delete earlier runs. */
export function SavedRuns({ runs, error, canSave, defaultName, onSave, onOpen, onDelete }: {
  runs: SavedRunSummary[];
  error: string | null;
  canSave: boolean;
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  return (
    <section aria-labelledby="saved-h">
      <h3 id="saved-h" className="text-[15px] font-bold">Saved runs</h3>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor="run-name">Name for this run</label>
        <input id="run-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} maxLength={80}
          disabled={!canSave}
          className="min-w-0 flex-1 rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm placeholder:text-mut/70 disabled:opacity-50" />
        <Button type="submit" disabled={!canSave || busy}>
          <Save size={15} strokeWidth={1.75} /> Save
        </Button>
      </form>
      {!canSave && <p className="mt-1.5 text-[12px] text-mut">Run the simulation first; saving stores the inputs and the result.</p>}
      {(saveError || error) && <p role="alert" className="mt-1.5 text-[13px] text-alert">{saveError ?? error}</p>}
      {runs.length === 0 ? (
        <p className="mt-3 text-[13px] text-mut">No saved runs yet.</p>
      ) : (
        <ul className="mt-2">
          {runs.map((r) => (
            <li key={r.id} className="flex items-center gap-2 border-b border-line py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{r.name}</div>
                <div className="truncate text-[12px] text-mut">{scenarioSummary(r.scenario).join(" · ")}</div>
                <div className="truncate text-[12px] text-mut">Top: {r.recommended_rotation} · {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <button type="button" onClick={() => onOpen(r.id)} aria-label={`Open ${r.name}`}
                className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
                <FolderOpen size={16} strokeWidth={1.75} />
              </button>
              <button type="button" onClick={() => onDelete(r.id)} aria-label={`Delete ${r.name}`}
                className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-alert">
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
