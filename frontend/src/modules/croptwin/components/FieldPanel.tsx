/**
 * CropTwin right panel for the selected field: the editor (name, crop, soil texture, irrigation, area, boundary with
 * crossing and overlap warnings, typed corners), delete with confirmation, WeatherCard, SoilTable and CropHistoryList.
 * Field edits are drafts saved by "Save farm"; lib/draft.ts decides what is sent.
 */
import { AlertTriangle, Loader2, PenLine, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, KindTag } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { type LatLng, listNames, selfIntersects } from "../../../shared/map/BoundaryDraw";
import { formatTimestamp, formatTimestampWithAge } from "../../../shared/map/dates";
import { boundaryIsNew, type FieldDraft, overlappingNames, parseArea, toRing } from "../lib/draft";
import type { FarmProfile } from "../state/useFarmProfile";
import { CROPS, type CropId, SOIL_TEXTURES, type SoilTexture } from "../types";
import { useConfirm } from "./ConfirmDialog";
import { CropHistoryList } from "./CropHistoryList";
import { inputCls, labelCls, metaCls, sectionTitle } from "./form";
import { SoilTable } from "./SoilTable";
import { WeatherCard } from "./WeatherCard";
import { t as tr, tn as trn } from "../../../shared/i18n";

/** Right panel: the selected field's details and boundary, recent weather, soil layers and crop history. */
export function FieldPanel({ p }: { p: FarmProfile }) {
  const d = p.drafts.find((x) => x.id === p.selectedId);
  if (!d) {
    return (
      <div className="p-[18px]">
        <h2 className={sectionTitle}>{tr("No field selected")}</h2>
        <p className={`mt-1 ${metaCls}`}>{tr("Pick a field from the list, or draw a new one.")}</p>
      </div>
    );
  }
  // The demo farm is read-only (app/access.py): everything shows, nothing can be changed.
  return (
    <fieldset key={d.id} disabled={!!p.farm?.public} aria-label={p.farm?.public ? tr("Read-only field") : undefined}
      className="scroll-thin m-0 h-full min-h-0 min-w-0 space-y-5 overflow-y-auto border-0 px-[18px] pb-5 pt-[18px]">
      <FieldEditor key={d.id} p={p} d={d} />
      {!d.isNew && p.farm && (
        <>
          <div className="border-t border-line" />
          <WeatherCard farmId={p.farm.id} fieldId={d.id} />
        </>
      )}
      <div className="border-t border-line" />
      <SoilTable p={p} d={d} />
      <div className="border-t border-line" />
      <CropHistoryList p={p} d={d} />
    </fieldset>
  );
}

/** ", with its 3 soil layers and 1 crop history entry", or "" when there's nothing else to lose. */
function goesWith(layers: number, history: number): string {
  const parts = [
    layers && trn(layers, "{n} soil layer", "{n} soil layers"),
    history && trn(history, "{n} crop history entry", "{n} crop history entries"),
  ].filter(Boolean);
  return parts.length ? tr(" with its {join}", { join: parts.join(tr(" and ")) }) : "";
}

function FieldEditor({ p, d }: { p: FarmProfile; d: FieldDraft }) {
  const { actions } = p;
  const saved = p.savedField(d.id);
  const set = (patch: Partial<FieldDraft>) => actions.updateDraft(d.id, patch);
  const drawingThis = p.drawing?.fieldId === d.id;
  const area = parseArea(d.areaInput);
  const boundaryChanged = saved && JSON.stringify(d.ring) !== JSON.stringify(toRing(saved.boundary));
  const crossing = d.closed && d.ring.length >= 3 && selfIntersects(d.ring);
  // Only a new or changed outline must not overlap; fields saved before the rule existed keep working.
  const overlapsWith = boundaryIsNew(d, saved) ? overlappingNames(d, p.drafts) : [];
  const confirm = useConfirm();
  const u = useUnits();

  const remove = async () => {
    if (!saved) return;
    const ok = await confirm({
      title: tr("Delete {name}?", { name: saved.name }),
      danger: true,
      confirmLabel: tr("Delete field"),
      cancelLabel: tr("Keep it"),
      body: (
        <>
          <p>
            {tr("{name} ({area_ha} ha,", { name: saved.name, area_ha: saved.area_ha })} {saved.area_source === "farmer" ? tr("farmer-stated") : tr("computed from boundary")}{tr(") is removed{goesWith}. This can't be undone.", { goesWith: goesWith(saved.soil_layers.length, saved.crop_history.length) })}
          </p>
          <p>{tr("Saved Simulator runs for this field stay readable, but can't be run again.")}</p>
        </>
      ),
    });
    if (ok) await actions.deleteField(saved.id);
  };

  return (
    <section aria-labelledby="field-h" className="space-y-3.5">
      <div className="flex items-start justify-between gap-2">
        <h2 id="field-h" className="text-[21px] font-bold tracking-[-.01em]">{d.name || tr("Unnamed field")}</h2>
        {d.isNew ? (
          <Button variant="ghost" className="max-sm:min-h-11" onClick={() => actions.discardNewField(d.id)}
            aria-label={tr("Discard this new field")}>
            <Trash2 size={15} strokeWidth={1.75} /> {tr("Discard")}
          </Button>
        ) : (
          <Button variant="ghost" className="shrink-0 hover:!text-alert max-sm:min-h-11" onClick={() => void remove()}
            disabled={!!p.drawing || p.busy === "delete"}>
            {p.busy === "delete" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} strokeWidth={1.75} />}
            {tr("Delete field")}
          </Button>
        )}
      </div>

      {saved && (
        <p className={`-mt-2 ${metaCls}`}>
          {tr("Field details saved {formatTimestampWithAge} · added {formatTimestamp}", { formatTimestampWithAge: formatTimestampWithAge(saved.updated_at), formatTimestamp: formatTimestamp(saved.created_at) })}
        </p>
      )}

      <div>
        <label htmlFor="f-name" className={labelCls}>{tr("Name")}</label>
        <input id="f-name" className={inputCls} value={d.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="f-crop" className={labelCls}>{tr("Current crop")}</label>
          <select id="f-crop" className={inputCls} value={d.current_crop_id ?? ""}
            onChange={(e) => set({ current_crop_id: (e.target.value || null) as CropId | null })}>
            <option value="">{tr("Not recorded")}</option>
            {CROPS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-texture" className={labelCls}>{tr("Soil texture")}</label>
          <select id="f-texture" className={inputCls} value={d.soil_texture ?? ""}
            onChange={(e) => set({ soil_texture: (e.target.value || null) as SoilTexture | null })}>
            <option value="">{tr("Not known")}</option>
            {SOIL_TEXTURES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <p className={`-mt-2 ${metaCls}`}>{tr("Texture is your own estimate. Soil layers below take precedence when they exist.")}</p>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold max-sm:min-h-11">
        <input type="checkbox" checked={d.irrigation_available} onChange={(e) => set({ irrigation_available: e.target.checked })}
          className="h-4 w-4 accent-[var(--color-lime)]" />
        {tr("Irrigation available")}
      </label>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold">{tr("Area")}</span>
          {saved && (
            <span className="flex items-center gap-2 text-[13px]">
              <span className="text-[15px] font-extrabold">{u.system === "us" ? tr("{area} ({area_ha} ha)", { area: u.area(saved.area_ha), area_ha: saved.area_ha }) : tr("{area_ha} ha", { area_ha: saved.area_ha })}</span>
              <KindTag kind={saved.area_source === "farmer" ? "observed" : "modelled"} />
              <span className="text-mut">{saved.area_source === "farmer" ? tr("farmer-stated") : tr("computed from boundary")}</span>
            </span>
          )}
        </div>
        <label htmlFor="f-area" className="sr-only">{tr("Area you know, in hectares")}</label>
        <input id="f-area" inputMode="decimal" className={inputCls} value={d.areaInput}
          placeholder={tr("Area you know (ha), or leave empty to compute it")}
          aria-invalid={area === "invalid"} onChange={(e) => set({ areaInput: e.target.value })} />
        <p className={`mt-1 ${area === "invalid" ? "text-[12px] text-alert" : metaCls}`}>
          {area === "invalid" ? tr("Enter hectares as a number above 0, or leave it empty.")
            : area === null ? (saved && !boundaryChanged ? tr("Computed from the boundary you drew.") : tr("Computed from the boundary when you save."))
              : tr("Saved as farmer-stated. Clear it to use the area computed from the boundary.")}
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">{tr("Boundary")}</span>
          <span className={metaCls}>{d.closed && d.ring.length >= 3 ? tr("{length} corners", { length: d.ring.length }) : tr("Not finished")}</span>
        </div>
        {drawingThis ? (
          <p className={metaCls}>{tr("Drawing on the map. Use the toolbar there to add, undo or close corners.")}</p>
        ) : (
          <Button className="max-sm:min-h-11" onClick={() => actions.editBoundary(d.id)} disabled={!!p.drawing}>
            <PenLine size={15} strokeWidth={1.75} /> {d.ring.length ? tr("Edit or redraw on the map") : tr("Draw on the map")}
          </Button>
        )}
        {crossing && (
          <p role="alert" className="mt-2 flex gap-1.5 text-[12px] font-semibold leading-snug text-alert">
            <AlertTriangle size={14} strokeWidth={2} className="mt-px shrink-0" />
            {tr("The boundary's edges cross, so its area can't be worked out. Drag a corner or redraw it before saving.")}
          </p>
        )}
        {overlapsWith.length > 0 && (
          <p role="alert" className="mt-2 flex gap-1.5 text-[12px] font-semibold leading-snug text-alert">
            <AlertTriangle size={14} strokeWidth={2} className="mt-px shrink-0" />
            {tr("This boundary overlaps {listNames} (outlined in red on the map). Fields can share an edge, not area: move the corners before saving.", { listNames: listNames(overlapsWith) })}
          </p>
        )}
        <CoordinateEntry ring={d.ring} disabled={!!p.drawing && !drawingThis}
          onApply={(ring) => { set({ ring, closed: true }); if (drawingThis) actions.finishBoundary(); }} />
      </div>
    </section>
  );
}

/** Keyboard and screen-reader fallback for the map: corners typed as "lat, lon", one per line. */
function CoordinateEntry({ ring, onApply, disabled }: { ring: LatLng[]; onApply: (ring: LatLng[]) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Follow the map: corners placed or dragged there show up here.
  useEffect(() => setText(ring.map(([lat, lon]) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`).join("\n")), [ring]);

  const apply = () => {
    const pts: LatLng[] = [];
    for (const [i, line] of text.split("\n").map((l) => l.trim()).filter(Boolean).entries()) {
      const [lat, lon] = line.split(/[,\s]+/).map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        setError(tr("Line {v} isn't \"latitude, longitude\" in degrees (for example 42.0367, -93.4625).", { v: i + 1 }));
        return;
      }
      pts.push([lat, lon]);
    }
    if (pts.length < 3) {
      setError(tr("Enter at least three corners, one per line."));
      return;
    }
    setError(null);
    onApply(pts);
  };

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[13px] font-semibold text-mut hover:text-tx max-sm:py-3">{tr("Type corner coordinates instead")}</summary>
      <label htmlFor="f-coords" className={`mt-2 block ${metaCls}`}>{tr("One corner per line, as latitude, longitude (WGS84 degrees).")}</label>
      <textarea id="f-coords" rows={4} className={`${inputCls} mt-1 font-mono text-[13px]`} value={text}
        disabled={disabled} onChange={(e) => setText(e.target.value)} />
      {error && <p role="alert" className="mt-1 text-[12px] text-alert">{error}</p>}
      <Button className="mt-2 max-sm:min-h-11" onClick={apply} disabled={disabled}>{tr("Use these corners")}</Button>
    </details>
  );
}
