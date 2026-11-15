/**
 * CropTwin left panel for an open farm: the farm picker (passed in by the page), demo notice, farm name, region and
 * map point, saved dates, the fields list, priority weights, constraints, and the one primary button "Save farm" with
 * its status line. Reads and writes through state/useFarmProfile.ts. The Simulator starts from these priority weights.
 */
import { Check, Info, Loader2, Lock, MapPin, PenLine, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button, FieldRow } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { formatTimestamp, formatTimestampWithAge } from "../../../shared/map/dates";
import { cropName, isDirty } from "../lib/draft";
import type { FarmProfile } from "../state/useFarmProfile";
import type { PriorityId } from "../types";
import { inputCls, labelCls, metaCls, sectionTitle } from "./form";
import { t, tn } from "../../../shared/i18n";

const PRIORITIES: { id: PriorityId; label: string }[] = [
  { id: "yield", label: t("Yield") },
  { id: "water", label: t("Save water") },
  { id: "risk", label: t("Avoid bad years") },
  { id: "soil", label: t("Soil health") },
  { id: "margin", label: t("Margin") },
];
const LEVELS = [{ v: 0, label: t("Off") }, { v: 1, label: t("Low") }, { v: 2, label: t("Med") }, { v: 3, label: t("High") }];

/**
 * Left panel: farm picker, demo notice, farm details, fields list, priorities, constraints, and "Save farm".
 * A public farm (the demo farm) is read-only: its fields can be opened, nothing can be changed, and the notice offers
 * `onOwnFarm` (an account, then a new farm of your own) instead of "Save farm".
 */
export function FarmPanel({ p, picker, onOwnFarm, signedIn }: { p: FarmProfile; picker?: ReactNode; onOwnFarm?: () => void; signedIn?: boolean }) {
  const { farm, farmDraft, drafts, selectedId, drawing, actions } = p;
  const u = useUnits();
  if (!farm || !farmDraft) return null;
  const saveBlocked = !!drawing;
  const readOnly = farm.public;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-[18px] pb-4 pt-[18px]">
        {picker}
        {readOnly ? (
          <div className="rounded-[14px] border border-line px-3 py-3" role="note" aria-label={t("Read-only demo farm")}>
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <Lock size={15} strokeWidth={1.5} className="shrink-0 text-mut" /> {t("Demo farm, read-only")}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-mut">
              {t("Look around freely: open the fields, run the Simulator, ask the advisor. To draw your own fields and save changes, add a farm of your own.")}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-mut">
              {t("Its first three fields are illustrative outlines in Story County, Iowa, and SoilGrids soil comes from one saved sample point.")}
            </p>
            {onOwnFarm && (
              <Button variant="primary" className="mt-3 w-full max-sm:min-h-11" onClick={onOwnFarm}>
                {signedIn ? <><Plus size={15} strokeWidth={1.75} /> {t("New farm")}</> : t("Create an account")}
              </Button>
            )}
          </div>
        ) : farm.id === "demo" && (
          <div className="flex gap-2.5 rounded-[14px] border border-line px-3 py-2.5" role="note">
            <Info size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-rain" />
            <p className="text-[13px] leading-snug">
              <span className="font-bold">{t("Demo farm with sample data.")}</span>{" "}
              <span className="text-mut">{t("Its first three fields are illustrative outlines in Story County, Iowa, and SoilGrids soil comes from one saved sample point.")}</span>
            </p>
          </div>
        )}

        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
        <section aria-labelledby="farm-h" className="space-y-2.5">
          <h2 id="farm-h" className={sectionTitle}>{t("Farm")}</h2>
          <div>
            <label htmlFor="farm-name" className={labelCls}>{t("Name")}</label>
            <input id="farm-name" className={inputCls} value={farmDraft.name} maxLength={200} aria-invalid={!farmDraft.name.trim()}
              onChange={(e) => actions.setFarmDraft({ name: e.target.value })} />
            {!farmDraft.name.trim() && <p className="mt-1 text-[12px] text-alert">{t("The farm needs a name.")}</p>}
          </div>
          <div>
            <label htmlFor="farm-region" className={labelCls}>{t("Region")}</label>
            <input id="farm-region" className={inputCls} value={farmDraft.region} maxLength={200}
              placeholder={t("e.g. Story County, Iowa")} onChange={(e) => actions.setFarmDraft({ region: e.target.value })} />
          </div>
          <p className={`flex items-center gap-1.5 ${metaCls}`}>
            <MapPin size={13} strokeWidth={1.75} className="shrink-0" />
            {farm.location_lat !== null && farm.location_lon !== null
              ? t("Map point {toFixed}, {toFixed2}", { toFixed: farm.location_lat.toFixed(5), toFixed2: farm.location_lon.toFixed(5) })
              : t("No map point: the map opens on the fields.")}
          </p>
          <p className={metaCls}>
            {t("Farm details saved {formatTimestampWithAge}", { formatTimestampWithAge: formatTimestampWithAge(farm.updated_at) })}
            {p.loadedAt && <> {t("· data as of {formatTimestamp}", { formatTimestamp: formatTimestamp(p.loadedAt) })}</>}
          </p>
        </section>

        </fieldset>

        <div className="border-t border-line" />

        <section aria-labelledby="fields-h" data-tour="fp-fields">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="fields-h" className={sectionTitle}>{t("Fields")}</h2>
            <span className="text-[13px] text-mut">{tn(drafts.length, "{n} field", "{n} fields")}</span>
          </div>
          {drafts.length === 0 ? (
            <div className="rounded-[14px] border border-line p-4">
              <h3 className="text-[17px] font-bold">{t("Draw your first field")}</h3>
              <p className="mt-1 text-sm leading-normal text-mut">
                {t("Press Draw a field, then click the map at each corner of the field. You can also type the corner coordinates.")}
              </p>
            </div>
          ) : (
            <div className="space-y-1" role="radiogroup" aria-label={t("Field to edit")}>
              {drafts.map((d) => {
                const on = d.id === selectedId;
                const saved = p.savedField(d.id);
                return (
                  <FieldRow key={d.id} radio name={d.name || t("Unnamed field")} shape={d.ring.length >= 3 ? d.ring : undefined} ndviStep={null}
                    meta={saved ? (d.current_crop_id ? cropName(d.current_crop_id)! : t("No current crop")) : t("Not saved yet")}
                    value={saved ? u.area(saved.area_ha) : "–"} delta={isDirty(d, saved) ? t("Unsaved") : undefined} tone="watch"
                    selected={on} disabled={!!drawing && !on} onSelect={() => actions.select(d.id)} />
                );
              })}
            </div>
          )}
          {!readOnly && (
            <Button className="mt-2 w-full max-sm:min-h-11" onClick={() => actions.startNewField()} disabled={!!drawing}>
              {drafts.length ? <Plus size={16} strokeWidth={1.75} /> : <PenLine size={16} strokeWidth={1.75} />} {t("Draw a field")}
            </Button>
          )}
        </section>

        <div className="border-t border-line" />

        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <section aria-labelledby="prio-h">
          <h2 id="prio-h" className={`mb-1 ${sectionTitle}`}>{t("Your priorities")}</h2>
          <p className={`mb-2 ${metaCls}`}>{t("The weights the Simulator starts from when it ranks rotations for this farm.")}</p>
          <div className="space-y-1.5">
            {PRIORITIES.map(({ id, label }) => {
              const value = Math.round(farmDraft.priorities[id]);
              return (
                <div key={id} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{label}</span>
                  <div role="radiogroup" aria-label={t("{label} weight", { label })} className="flex gap-0.5 rounded-[10px] bg-black/25 p-0.5">
                    {LEVELS.map((l) => (
                      <button key={l.v} type="button" role="radio" aria-checked={value === l.v}
                        onClick={() => actions.setFarmDraft({ priorities: { ...farmDraft.priorities, [id]: l.v } })}
                        className={`min-w-[40px] rounded-[8px] px-2 py-1 text-[12px] font-semibold max-sm:min-h-11 max-sm:min-w-11 ${
                          value === l.v ? "bg-glass-sel text-tx shadow-[inset_0_1px_0_rgb(255_255_255/.15)]" : "text-mut hover:text-tx"}`}>
                        {t(l.label)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <label htmlFor="constraints" className={labelCls}>{t("Constraints")}</label>
          <textarea id="constraints" rows={3} className={`${inputCls} resize-y leading-normal`}
            placeholder={t("In your own words, e.g. no irrigation on the west side")}
            value={farmDraft.constraints} onChange={(e) => actions.setFarmDraft({ constraints: e.target.value })} />
          <p className={`mt-1 ${metaCls}`}>{t("Kept as you write it. The Simulator doesn't read it yet.")}</p>
        </section>
        </fieldset>
      </div>

      {!readOnly && <div className="border-t border-line p-[14px]">
        {p.saveError && <p role="alert" className="mb-2 text-[13px] leading-snug text-alert">{p.saveError}</p>}
        <p className={`mb-2 ${metaCls}`} role="status" aria-live="polite">
          {saveBlocked ? t("Finish or cancel the boundary to save.")
            : p.dirty ? t("You have unsaved changes.")
              : (
                <span className="inline-flex items-center gap-1">
                  <Check size={13} strokeWidth={2} className="shrink-0 text-ok" /> {p.lastSaved ?? t("All changes saved")}
                </span>
              )}
        </p>
        <Button variant="primary" onClick={() => void actions.save()} disabled={!p.dirty || p.saving || saveBlocked}
          className={"w-full !py-3 disabled:border disabled:border-line disabled:text-mut disabled:shadow-none "
            + "disabled:[background:var(--color-glass-hi)]"}>
          {p.saving && <Loader2 size={16} className="animate-spin" />}
          {p.saving ? t("Saving…") : t("Save farm")}
        </Button>
      </div>}
    </div>
  );
}
