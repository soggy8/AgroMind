/**
 * CropTwin: choose the open farm, start a new one, or delete the open one. It only reports the user's choice; the page
 * (FarmProfilePage) decides what happens and asks first when there are unsaved changes. The list comes from
 * state/useFarms.ts.
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../shared/components";
import type { FarmSummary } from "../types";
import { labelCls } from "./form";
import { t, tn } from "../../../shared/i18n";

/** Which farm is open, plus "New farm" and "Delete farm". Switching and deleting ask first (the page decides). */
export function FarmPicker({ farms, selectedId, onSwitch, onNew, onDelete, disabled }: {
  farms: FarmSummary[];
  selectedId: string | null;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  return (
    <section aria-label={t("Your farms")} className="space-y-2">
      {farms.length > 0 && (
        <div>
          <label htmlFor="farm-picker" className={labelCls}>{t("Farm")}</label>
          <select id="farm-picker" value={selectedId ?? ""} disabled={disabled} onChange={(e) => onSwitch(e.target.value)}
            className="w-full rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm font-semibold text-tx max-sm:min-h-11">
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {tn(f.field_count, "{n} field", "{n} fields")}{f.region ? ` · ${f.region}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="max-sm:min-h-11" onClick={onNew} disabled={disabled}>
          <Plus size={15} strokeWidth={1.75} /> {t("New farm")}
        </Button>
        {onDelete && (
          <Button variant="ghost" className="hover:!text-alert max-sm:min-h-11" onClick={onDelete} disabled={disabled}>
            <Trash2 size={15} strokeWidth={1.75} /> {t("Delete farm")}
          </Button>
        )}
      </div>
    </section>
  );
}
