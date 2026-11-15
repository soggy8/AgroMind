/**
 * The Overview's one recommendation: the most useful thing to do next on this farm, from what the three modules
 * report. Pure, so it is easy to test and to reason about. Wording stays cautious (DESIGN.md section 8).
 */
import type { FarmHealth } from "../../modules/cropdoctor/types";
import type { FarmOut } from "../../modules/croptwin/types";
import type { SavedRunSummary } from "../../modules/simulator/types";
import type { AppRoute } from "../route";
import { t, tn } from "../../shared/i18n";

export interface NextStep {
  tone: "watch" | "act" | "ok";
  title: string;
  body: string;
  action: string;
  route: AppRoute;
}

/** How complete the farm profile is: the checks the Farm profile card lists. */
export function setupChecks(farm: FarmOut) {
  const n = farm.fields.length;
  const count = (ok: (f: FarmOut["fields"][number]) => boolean) => farm.fields.filter(ok).length;
  return [
    { id: "fields", label: t("Fields drawn"), done: n > 0, detail: n ? tn(n, "{n} field", "{n} fields") : t("none yet") },
    { id: "crop", label: t("Current crop"), done: n > 0 && count((f) => !!f.current_crop_id) === n, detail: t("{a} of {b}", { a: count((f) => !!f.current_crop_id), b: n }) },
    { id: "soil", label: t("Soil"), done: n > 0 && count((f) => f.soil_layers.length > 0 || !!f.soil_texture) === n,
      detail: t("{a} of {b}", { a: count((f) => f.soil_layers.length > 0 || !!f.soil_texture), b: n }) },
    { id: "history", label: t("Crop history"), done: n > 0 && count((f) => f.crop_history.length > 0) === n, detail: t("{a} of {b}", { a: count((f) => f.crop_history.length > 0), b: n }) },
  ];
}

export function nextStep(farm: FarmOut | null, health: FarmHealth | null, runs: SavedRunSummary[] | null): NextStep | null {
  if (farm && farm.fields.length === 0) {
    return { tone: "act", title: t("Draw your first field"), route: "farm-profile", action: t("Open farm profile"),
      body: t("Everything in AgroMind works field by field. Find your farm on the map and trace a field's corners; its area is worked out for you.") };
  }
  const finding = health?.findings[0];
  if (finding) {
    const check = finding.explanations[0]?.check;
    return { tone: "watch", title: `${finding.field_name}: ${finding.headline.toLowerCase()}`, route: "command-center", action: t("See why in the Command Center"),
      body: `${finding.summary}${check ? t(" Suggested check: {check}", { check }) : ""}` };
  }
  if (farm) {
    const soil = setupChecks(farm).find((c) => c.id === "soil");
    if (soil && !soil.done) {
      return { tone: "act", title: t("Add soil for your fields"), route: "farm-profile", action: t("Open farm profile"),
        body: t("Soil decides how much water a field holds through a dry spell. {detail} fields have it; fill the rest from ISRIC SoilGrids in one click.", { detail: soil.detail }) };
    }
  }
  if (runs && runs.length === 0 && (farm?.fields.length ?? 0) > 0) {
    return { tone: "act", title: t("Test a rotation before you plant it"), route: "simulator", action: t("Open the Simulator"),
      body: t("Compare up to four crop rotations on one field over 25 years of NASA weather, in today's climate or a hotter, drier one.") };
  }
  if (health || runs) {
    return { tone: "ok", title: t("Nothing needs you right now"), route: "simulator", action: runs?.length ? t("Review your last run") : t("Open the Simulator"),
      body: t("No field is below its normal on this date. A good time to plan: try a rotation under a NASA climate projection.") };
  }
  return null;
}
