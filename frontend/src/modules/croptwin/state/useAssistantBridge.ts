import { type Change, useAssistantTarget } from "../../../shared/assistant";
import type { CropHistoryIn, CropId, FieldUpdate, SoilTexture } from "../types";
import type { FarmProfile } from "./useFarmProfile";
import { t } from "../../../shared/i18n";

/**
 * Lets the assistant (shared/assistant) pick a field here, and saves the farm changes the farmer confirmed on the
 * assistant's cards. The assistant itself never writes: each change goes through CropTwin's own API from here,
 * only after the farmer pressed Confirm.
 */
export function useAssistantBridge(p: FarmProfile, onFarmSaved: (farmId: string) => void) {
  const name = (id: string | undefined | null) => p.drafts.find((d) => d.id === id)?.name ?? id ?? "none";
  useAssistantTarget({
    page: "farm-profile",
    state: () => ({ field_id: p.selectedId ?? null }),
    apply: (a): Change[] => {
      if (a.type !== "select_field" || a.field_id === p.selectedId) return [];
      const before = name(p.selectedId);
      p.actions.select(a.field_id);
      return [{ label: t("Field"), before, after: a.field_name ?? name(a.field_id) }];
    },
    snapshot: () => p.selectedId,
    restore: (s) => { if (typeof s === "string") p.actions.select(s); },
    confirm: async (c) => {
      switch (c.kind) {
        case "update_field": {
          const { kind: _k, field_id, current_crop_id, soil_texture, ...rest } = c;
          const body: FieldUpdate = { ...rest };
          if (current_crop_id !== undefined) body.current_crop_id = current_crop_id as CropId;
          if (soil_texture !== undefined) body.soil_texture = soil_texture as SoilTexture;
          await p.actions.saveFieldChange(field_id, body);
          p.actions.select(field_id);
          return t("Saved.");
        }
        case "add_crop_history": {
          const { kind: _k, field_id, ...entry } = c;
          await p.actions.saveCropHistory(field_id, { ...entry, crop_id: entry.crop_id as CropId } as CropHistoryIn);
          p.actions.select(field_id);
          return t("Saved to the crop history.");
        }
        case "update_farm": {
          const { kind: _k, ...body } = c;
          const farm = await p.actions.saveFarmChange(body as Parameters<FarmProfile["actions"]["saveFarmChange"]>[0]);
          onFarmSaved(farm.id);
          return t("Saved.");
        }
        case "draw_new_field":
          if (p.drawing) throw new Error(t("Finish the outline you are drawing first."));
          p.actions.startNewField({
            name: c.name, current_crop_id: c.current_crop_id as CropId | null, irrigation_available: c.irrigation_available,
            soil_texture: c.soil_texture as SoilTexture | null,
          });
          return t("Draw its outline on the map, then press Save farm.");
      }
    },
  }, !!p.farm);
}
