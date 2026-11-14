/**
 * CropTwin left panel for an open farm: the farm picker (passed in by the page), demo notice, farm name, region and
 * map point, saved dates, the fields list, priority weights, constraints, and the one primary button "Save farm" with
 * its status line. Reads and writes through state/useFarmProfile.ts. The Simulator starts from these priority weights.
 */
import { Check, Info, Loader2, MapPin, PenLine, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../shared/components";
import { formatTimestamp, formatTimestampWithAge } from "../../../shared/map/dates";
import { cropName, isDirty } from "../lib/draft";
import type { FarmProfile } from "../state/useFarmProfile";
import type { PriorityId } from "../types";
import { inputCls, labelCls, metaCls, sectionTitle } from "./form";

const PRIORITIES: { id: PriorityId; label: string }[] = [
  { id: "yield", label: "Yield" },
  { id: "water", label: "Save water" },
  { id: "risk", label: "Avoid bad years" },
  { id: "soil", label: "Soil health" },
  { id: "margin", label: "Margin" },
];
const LEVELS = [{ v: 0, label: "Off" }, { v: 1, label: "Low" }, { v: 2, label: "Med" }, { v: 3, label: "High" }];

/** Left panel: farm picker, demo notice, farm details, fields list, priorities, constraints, and "Save farm". */
export function FarmPanel({ p, picker }: { p: FarmProfile; picker?: ReactNode }) {
  const { farm, farmDraft, drafts, selectedId, drawing, actions } = p;
  if (!farm || !farmDraft) return null;
  const saveBlocked = !!drawing;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-[18px] pb-4 pt-[18px]">
        {picker}
        {farm.id === "demo" && (
          <div className="flex gap-2.5 rounded-[14px] border border-line px-3 py-2.5" role="note">
            <Info size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-rain" />
            <p className="text-[13px] leading-snug">
              <span className="font-bold">Demo farm with sample data.</span>{" "}
              <span className="text-mut">Its first three fields are illustrative outlines in Story County, Iowa, and SoilGrids soil comes from one saved sample point.</span>
            </p>
          </div>
        )}

        <section aria-labelledby="farm-h" className="space-y-2.5">
          <h2 id="farm-h" className={sectionTitle}>Farm</h2>
          <div>
            <label htmlFor="farm-name" className={labelCls}>Name</label>
            <input id="farm-name" className={inputCls} value={farmDraft.name} maxLength={200} aria-invalid={!farmDraft.name.trim()}
              onChange={(e) => actions.setFarmDraft({ name: e.target.value })} />
            {!farmDraft.name.trim() && <p className="mt-1 text-[12px] text-alert">The farm needs a name.</p>}
          </div>
          <div>
            <label htmlFor="farm-region" className={labelCls}>Region</label>
            <input id="farm-region" className={inputCls} value={farmDraft.region} maxLength={200}
              placeholder="e.g. Story County, Iowa" onChange={(e) => actions.setFarmDraft({ region: e.target.value })} />
          </div>
          <p className={`flex items-center gap-1.5 ${metaCls}`}>
            <MapPin size={13} strokeWidth={1.75} className="shrink-0" />
            {farm.location_lat !== null && farm.location_lon !== null
              ? `Map point ${farm.location_lat.toFixed(5)}, ${farm.location_lon.toFixed(5)}`
              : "No map point: the map opens on the fields."}
          </p>
          <p className={metaCls}>
            Farm details saved {formatTimestampWithAge(farm.updated_at)}
            {p.loadedAt && <> · data as of {formatTimestamp(p.loadedAt)}</>}
          </p>
        </section>

        <div className="border-t border-line" />

        <section aria-labelledby="fields-h">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="fields-h" className={sectionTitle}>Fields</h2>
            <span className="text-[13px] text-mut">{drafts.length} {drafts.length === 1 ? "field" : "fields"}</span>
          </div>
          {drafts.length === 0 ? (
            <div className="rounded-[14px] border border-line p-4">
              <h3 className="text-[17px] font-bold">Draw your first field</h3>
              <p className="mt-1 text-sm leading-normal text-mut">
                Press Draw a field, then click the map at each corner of the field. You can also type the corner coordinates.
              </p>
            </div>
          ) : (
            <div className="space-y-1" role="radiogroup" aria-label="Field to edit">
              {drafts.map((d) => {
                const on = d.id === selectedId;
                const saved = p.savedField(d.id);
                const changed = isDirty(d, saved);
                return (
                  <button key={d.id} type="button" role="radio" aria-checked={on} onClick={() => actions.select(d.id)}
                    disabled={!!drawing && !on}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 text-left disabled:opacity-50 ${
                      on ? "border-white/12 bg-glass-sel" : "border-transparent hover:bg-glass-hi"}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold">{d.name || "Unnamed field"}</span>
                      <span className="block text-[13px] text-mut">
                        {d.current_crop_id ? cropName(d.current_crop_id) : "No current crop"}
                        {saved ? ` · ${saved.area_ha} ha` : " · not saved yet"}
                      </span>
                    </span>
                    {changed && <span className="shrink-0 text-[12px] font-semibold text-mut">Unsaved</span>}
                  </button>
                );
              })}
            </div>
          )}
          <Button className="mt-2 w-full max-sm:min-h-11" onClick={actions.startNewField} disabled={!!drawing}>
            {drafts.length ? <Plus size={16} strokeWidth={1.75} /> : <PenLine size={16} strokeWidth={1.75} />} Draw a field
          </Button>
        </section>

        <div className="border-t border-line" />

        <section aria-labelledby="prio-h">
          <h2 id="prio-h" className={`mb-1 ${sectionTitle}`}>Your priorities</h2>
          <p className={`mb-2 ${metaCls}`}>The weights the Simulator starts from when it ranks rotations for this farm.</p>
          <div className="space-y-1.5">
            {PRIORITIES.map(({ id, label }) => {
              const value = Math.round(farmDraft.priorities[id]);
              return (
                <div key={id} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{label}</span>
                  <div role="radiogroup" aria-label={`${label} weight`} className="flex gap-0.5 rounded-[10px] bg-black/25 p-0.5">
                    {LEVELS.map((l) => (
                      <button key={l.v} type="button" role="radio" aria-checked={value === l.v}
                        onClick={() => actions.setFarmDraft({ priorities: { ...farmDraft.priorities, [id]: l.v } })}
                        className={`min-w-[40px] rounded-[8px] px-2 py-1 text-[12px] font-semibold max-sm:min-h-11 max-sm:min-w-11 ${
                          value === l.v ? "bg-glass-sel text-tx shadow-[inset_0_1px_0_rgb(255_255_255/.15)]" : "text-mut hover:text-tx"}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <label htmlFor="constraints" className={labelCls}>Constraints</label>
          <textarea id="constraints" rows={3} className={`${inputCls} resize-y leading-normal`}
            placeholder="In your own words, e.g. no irrigation on the west side"
            value={farmDraft.constraints} onChange={(e) => actions.setFarmDraft({ constraints: e.target.value })} />
          <p className={`mt-1 ${metaCls}`}>Kept as you write it. The Simulator doesn't read it yet.</p>
        </section>
      </div>

      <div className="border-t border-line p-[14px]">
        {p.saveError && <p role="alert" className="mb-2 text-[13px] leading-snug text-alert">{p.saveError}</p>}
        <p className={`mb-2 ${metaCls}`} role="status" aria-live="polite">
          {saveBlocked ? "Finish or cancel the boundary to save."
            : p.dirty ? "You have unsaved changes."
              : (
                <span className="inline-flex items-center gap-1">
                  <Check size={13} strokeWidth={2} className="shrink-0 text-ok" /> {p.lastSaved ?? "All changes saved"}
                </span>
              )}
        </p>
        <Button variant="primary" onClick={() => void actions.save()} disabled={!p.dirty || p.saving || saveBlocked}
          className={"w-full !py-3 disabled:border disabled:border-line disabled:text-mut disabled:shadow-none "
            + "disabled:[background:var(--color-glass-hi)]"}>
          {p.saving && <Loader2 size={16} className="animate-spin" />}
          {p.saving ? "Saving…" : "Save farm"}
        </Button>
      </div>
    </div>
  );
}
