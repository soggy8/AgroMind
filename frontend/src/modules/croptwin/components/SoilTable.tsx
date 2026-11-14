/**
 * CropTwin: a field's soil layers, each value tied to its source and kind (DESIGN.md section 8). SoilGrids layers are
 * MODELLED (mapped estimates at about 250 m); farmer or lab layers are OBSERVED with source "Farmer-provided".
 * "Prefill from SoilGrids" saves straight away (backend soil_source.py, the committed sample for now); lab layers added
 * here are drafts saved with "Save farm". The Simulator only uses layers with both sand % and clay %
 * (simulator/ports.py _soil_from_layers), so the form says so.
 */
import { CloudDownload, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, KindTag } from "../../../shared/components";
import { FARMER_SOURCE, type FieldDraft, nextKey, type SoilLayerDraft, soilKind } from "../lib/draft";
import type { FarmProfile } from "../state/useFarmProfile";
import { ActionError } from "./ActionError";
import { useConfirm } from "./ConfirmDialog";
import { inputCls, metaCls, sectionTitle } from "./form";
import { formatDayWithAge, formatTimestamp } from "../../../shared/map/dates";

type NumKey = "sand_pct" | "silt_pct" | "clay_pct" | "soc_g_kg" | "ph";
const COLS: { key: NumKey; label: string; unit: string; max: number }[] = [
  { key: "sand_pct", label: "Sand", unit: "%", max: 100 },
  { key: "silt_pct", label: "Silt", unit: "%", max: 100 },
  { key: "clay_pct", label: "Clay", unit: "%", max: 100 },
  { key: "soc_g_kg", label: "SOC", unit: "g/kg", max: 1000 },
  { key: "ph", label: "pH", unit: "", max: 14 },
];

/** One decimal, like the source data (32.0, not 32). */
const fmt = (v: number | null) => (v === null ? null : v.toFixed(1));

/** SoilGrids layers carry the day SoilGrids was queried (UTC); farmer layers the moment they were entered (local). */
const sourceDate = (instant: string | undefined, modelled: boolean) => !instant ? null
  : modelled ? `Retrieved ${formatDayWithAge(instant.slice(0, 10))}` : `Entered ${formatTimestamp(instant)}`;

/** Soil layers: every value tied to its source and kind (DESIGN.md section 8). */
export function SoilTable({ p, d }: { p: FarmProfile; d: FieldDraft }) {
  const sources = [...new Set(d.soil.map((l) => l.source))];
  const farmerLayers = d.soil.filter((l) => soilKind(l.source) !== "modelled").length;
  const set = (soil: SoilLayerDraft[]) => p.actions.updateDraft(d.id, { soil });

  const confirm = useConfirm();
  const prefill = async () => {
    if (farmerLayers && !(await confirm({
      title: "Replace your soil layers?",
      confirmLabel: "Replace with SoilGrids",
      cancelLabel: "Keep my layers",
      body: <p>Prefilling replaces every layer on {d.name || "this field"}, including the {farmerLayers} you entered. SoilGrids values are mapped estimates at about 250 m, not measurements of this field.</p>,
    }))) return;
    void p.actions.prefillSoil(d.id);
  };

  return (
    <section aria-labelledby="soil-h">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 id="soil-h" className={sectionTitle}>Soil layers</h2>
        <Button className="max-sm:min-h-11" onClick={() => void prefill()} disabled={d.isNew || p.busy === "soil"}
          title={d.isNew ? "Save the farm first, then prefill this field's soil." : undefined}>
          {p.busy === "soil" ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} strokeWidth={1.75} />}
          Prefill from SoilGrids
        </Button>
      </div>
      <p className={`mb-2 ${metaCls}`}>
        {d.isNew ? "Save the farm first, then prefill this field's soil from SoilGrids."
          : "SoilGrids gives mapped estimates at about 250 m, not measurements of this field. Lab results you add are kept as yours."}
      </p>

      <ActionError text={p.fieldError?.kind === "soil" ? p.fieldError.text : null} />
      {d.soil.length === 0 ? (
        <p className="rounded-[14px] border border-line p-3 text-sm text-mut">
          No soil layers yet. Prefill from SoilGrids, or add values from a lab report below.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Soil composition by depth, with the source of each layer</caption>
            <thead>
              <tr className="text-left text-[12px] text-mut">
                <th scope="col" className="py-1 pr-2 font-semibold">Depth</th>
                {COLS.map((c) => (
                  <th key={c.key} scope="col" className="px-1 py-1 text-right font-semibold">
                    {c.label}{c.unit && <span className="block font-medium">{c.unit}</span>}
                  </th>
                ))}
                <th scope="col"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {d.soil.map((l) => {
                const n = sources.indexOf(l.source) + 1;
                return (
                  <tr key={l.key} className="border-t border-line">
                    <th scope="row" className="whitespace-nowrap py-1.5 pr-2 text-left font-semibold">
                      {l.depth_top_cm}–{l.depth_bottom_cm} cm
                      <sup className="ml-0.5 text-[12px] text-mut" aria-label={`source ${n}`}>{n}</sup>
                    </th>
                    {COLS.map((c) => (
                      <td key={c.key} className="px-1 py-1.5 text-right">
                        {fmt(l[c.key]) ?? <span className="text-mut" aria-label="not given">–</span>}
                      </td>
                    ))}
                    <td className="pl-1 text-right">
                      <button type="button" aria-label={`Remove the ${l.depth_top_cm}–${l.depth_bottom_cm} cm layer`}
                        onClick={() => set(d.soil.filter((x) => x.key !== l.key))}
                        className="grid h-7 w-7 place-items-center rounded-[8px] text-mut hover:bg-glass-hi hover:text-tx max-sm:h-11 max-sm:w-11">
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ol className="mt-2 space-y-1.5">
            {sources.map((s, i) => {
              const kind = soilKind(s);
              return (
                <li key={s} className="flex gap-2 text-[12px] leading-snug">
                  <span className="text-mut">{i + 1}</span>
                  <span>
                    <KindTag kind={kind} className="mr-1.5 align-[1px]" />
                    <span className="text-mut">
                      {s}
                      {kind === "modelled" && " Mapped estimate at about 250 m, not a field measurement."}
                      {sourceDate(d.soil.find((l) => l.source === s)?.retrieved_at, kind === "modelled") && ` ${sourceDate(d.soil.find((l) => l.source === s)?.retrieved_at, kind === "modelled")}.`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <AddLayer onAdd={(l) => set([...d.soil, l].sort((a, b) => a.depth_top_cm - b.depth_top_cm))} />
    </section>
  );
}

/** A layer the farmer enters, e.g. from a lab report. Saved with "Save farm". */
function AddLayer({ onAdd }: { onAdd: (l: SoilLayerDraft) => void }) {
  const empty = { top: "", bottom: "", sand_pct: "", silt_pct: "", clay_pct: "", soc_g_kg: "", ph: "" };
  const [v, setV] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  const anyValue = COLS.some((c) => v[c.key].trim());
  const partial = anyValue && !(v.sand_pct.trim() && v.clay_pct.trim());

  const add = () => {
    const top = Number(v.top), bottom = Number(v.bottom);
    if (!v.top.trim() || !v.bottom.trim() || !Number.isInteger(top) || !Number.isInteger(bottom) || top < 0 || bottom <= top) {
      setError("Depths are whole centimetres, with the bottom deeper than the top (for example 0 and 30).");
      return;
    }
    const nums = {} as Record<NumKey, number | null>;
    for (const c of COLS) {
      const raw = v[c.key].trim();
      const n = Number(raw);
      if (raw && (!Number.isFinite(n) || n < 0 || n > c.max)) {
        setError(`${c.label} must be between 0 and ${c.max}${c.unit ? ` ${c.unit}` : ""}, or empty.`);
        return;
      }
      nums[c.key] = raw ? n : null;
    }
    if (COLS.every((c) => nums[c.key] === null)) {
      setError("Enter at least one value for the layer.");
      return;
    }
    setError(null);
    setV(empty);
    onAdd({ key: nextKey("layer"), depth_top_cm: top, depth_bottom_cm: bottom, ...nums, source: FARMER_SOURCE });
  };

  const box = (key: keyof typeof empty, label: string) => (
    <label className="block">
      <span className="mb-0.5 block text-[12px] text-mut">{label}</span>
      <input inputMode="decimal" className={`${inputCls} !px-2 !py-1.5`} value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </label>
  );

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[13px] font-semibold text-mut hover:text-tx max-sm:py-3">Add a layer from a lab report</summary>
      <p className={`mt-2 ${metaCls}`}>The Simulator only uses a layer that has both sand % and clay %. Other values are still saved and shown.</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {box("top", "Top cm")}
        {box("bottom", "Bottom cm")}
        {box("sand_pct", "Sand %")}
        {box("silt_pct", "Silt %")}
        {box("clay_pct", "Clay %")}
        {box("soc_g_kg", "SOC g/kg")}
        {box("ph", "pH")}
      </div>
      {partial && (
        <p className="mt-1.5 flex gap-1.5 text-[12px] leading-snug text-tx" role="note">
          <Info size={14} strokeWidth={1.75} className="mt-px shrink-0 text-rain" />
          Without {v.sand_pct.trim() ? "clay %" : v.clay_pct.trim() ? "sand %" : "sand % and clay %"}, the Simulator won&apos;t use this layer. You can still add it.
        </p>
      )}
      <p className={`mt-1.5 ${metaCls}`}>Source: {FARMER_SOURCE}. Saved with the farm.</p>
      {error && <p role="alert" className="mt-1 text-[12px] text-alert">{error}</p>}
      <Button className="mt-2 max-sm:min-h-11" onClick={add}><Plus size={15} strokeWidth={1.75} /> Add layer</Button>
    </details>
  );
}
