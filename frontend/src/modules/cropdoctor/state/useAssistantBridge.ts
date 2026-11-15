import { type Change, useAssistantTarget } from "../../../shared/assistant";
import { fmtDate } from "../lib/format";
import type { FarmHealth } from "../types";
import { t } from "../../../shared/i18n";

const LAYER_LABEL: Record<string, string> = { greenness: t("Greenness"), satellite: t("Satellite") };

/**
 * Lets the assistant (shared/assistant) set this page's date, map layer and field. Each change is reported for the
 * assistant's trace; `assist` names the control that flashes (data-assist on the page).
 */
export function useAssistantBridge<L extends string>({ health, asOf, setAsOf, fieldId, selectField, layer, setLayer }: {
  health: FarmHealth | null;
  asOf: string | null;
  setAsOf: (d: string | null) => void;
  fieldId: string | null;
  selectField: (id: string) => void;
  layer: L;
  setLayer: (l: L) => void;
}) {
  const name = (id: string | null) => health?.fields.find((f) => f.id === id)?.name ?? id ?? "none";
  useAssistantTarget({
    page: "command-center",
    state: () => ({ field_id: fieldId, as_of: health?.as_of ?? asOf, layer }),
    apply: (a): Change[] => {
      if (a.type === "set_date") {
        const before = health?.as_of ?? asOf;
        setAsOf(a.date);
        return before === a.date ? [] : [{ label: t("Date"), before: before ? fmtDate(before) : undefined, after: fmtDate(a.date), assist: "cc.date" }];
      }
      if (a.type === "set_layer") {
        setLayer(a.layer as L);
        return a.layer === layer ? [] : [{ label: t("Map"), before: LAYER_LABEL[layer], after: LAYER_LABEL[a.layer] ?? a.layer, assist: "cc.layer" }];
      }
      if (a.type === "select_field") {
        selectField(a.field_id);
        return a.field_id === fieldId ? []
          : [{ label: t("Field"), before: fieldId ? name(fieldId) : undefined, after: a.field_name ?? name(a.field_id) }];
      }
      return [];
    },
    snapshot: () => ({ asOf, fieldId, layer }),
    restore: (s) => {
      const snap = s as { asOf: string | null; fieldId: string | null; layer: L };
      setAsOf(snap.asOf);
      if (snap.fieldId) selectField(snap.fieldId);
      setLayer(snap.layer);
    },
  }, !!health);
}
