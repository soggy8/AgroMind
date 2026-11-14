/**
 * CropTwin left panel while creating a farm. The farm's point can come from "Use my location", a map click or a
 * search result; the page holds the draft so the map and search can fill it in.
 */
import { Crosshair, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../shared/components";
import type { LatLng } from "../../../shared/map/BoundaryDraw";
import { ActionError } from "./ActionError";
import { inputCls, labelCls, metaCls, sectionTitle } from "./form";

export interface NewFarmDraft {
  name: string;
  region: string;
  point: LatLng | null;
  /** Where the point came from, shown next to it. */
  pointFrom: "your location" | "the map" | "search" | null;
  picking: boolean;
}

export const emptyNewFarm = (): NewFarmDraft => ({ name: "", region: "", point: null, pointFrom: null, picking: false });

/**
 * Left panel while creating a farm: name, region and the farm's point. The point comes from "Use my location"
 * (the only time the user's location is saved, and only when they create the farm), a click on the map, or a
 * search result. The one primary button here is "Create farm".
 */
export function NewFarmPanel({ draft, onChange, onLocate, locating, onCreate, onCancel, creating, error, canCancel }: {
  draft: NewFarmDraft;
  onChange: (patch: Partial<NewFarmDraft>) => void;
  onLocate: () => void;
  locating: boolean;
  onCreate: () => void;
  onCancel: () => void;
  creating: boolean;
  error: string | null;
  canCancel: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const nameMissing = touched && !draft.name.trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-[18px] pb-4 pt-[18px]">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[21px] font-bold tracking-[-.01em]">New farm</h2>
          {canCancel && (
            <Button variant="ghost" className="max-sm:min-h-11" onClick={onCancel} aria-label="Cancel the new farm">
              <X size={15} strokeWidth={1.75} /> Cancel
            </Button>
          )}
        </div>

        <div>
          <label htmlFor="nf-name" className={labelCls}>Name</label>
          <input id="nf-name" className={inputCls} value={draft.name} maxLength={200} aria-invalid={nameMissing}
            onBlur={() => setTouched(true)} onChange={(e) => onChange({ name: e.target.value })} />
          {nameMissing && <p className="mt-1 text-[12px] text-alert">The farm needs a name.</p>}
        </div>
        <div>
          <label htmlFor="nf-region" className={labelCls}>Region</label>
          <input id="nf-region" className={inputCls} value={draft.region} maxLength={200} placeholder="e.g. Story County, Iowa"
            onChange={(e) => onChange({ region: e.target.value })} />
        </div>

        <section aria-labelledby="nf-point-h">
          <h3 id="nf-point-h" className={sectionTitle}>Where is it?</h3>
          <p className={`mb-2 ${metaCls}`}>The map opens here until you draw fields. You can also skip this and just draw fields.</p>
          {draft.point ? (
            <p className="mb-2 flex items-center gap-1.5 text-sm">
              <MapPin size={15} strokeWidth={1.75} className="shrink-0 text-lime" />
              <span className="font-semibold tabular-nums">{draft.point[0].toFixed(5)}, {draft.point[1].toFixed(5)}</span>
              <span className="text-[12px] text-mut">from {draft.pointFrom}</span>
            </p>
          ) : (
            <p className="mb-2 text-sm text-mut">No point chosen yet.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="max-sm:min-h-11" onClick={onLocate} disabled={locating}>
              {locating ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} strokeWidth={1.75} />} Use my location
            </Button>
            <Button className={`max-sm:min-h-11 ${draft.picking ? "!border-lime !text-lime" : ""}`} aria-pressed={draft.picking}
              onClick={() => onChange({ picking: !draft.picking })}>
              <Crosshair size={15} strokeWidth={1.75} /> {draft.picking ? "Click the map…" : "Pick on the map"}
            </Button>
            {draft.point && (
              <Button variant="ghost" className="max-sm:min-h-11" onClick={() => onChange({ point: null, pointFrom: null })}>Clear</Button>
            )}
          </div>
          <p className={`mt-2 ${metaCls}`}>
            Or search for a place on the map and choose a result. Your location is only saved if you create the farm with it.
          </p>
        </section>
        <ActionError text={error} />
      </div>

      <div className="border-t border-line p-[14px]">
        <Button variant="primary" className="w-full !py-3" disabled={creating}
          onClick={() => { setTouched(true); if (draft.name.trim()) onCreate(); }}>
          {creating && <Loader2 size={16} className="animate-spin" />}
          {creating ? "Creating…" : "Create farm"}
        </Button>
      </div>
    </div>
  );
}
