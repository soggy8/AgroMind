import { useRef } from "react";
import { type Change, useAssistantTarget } from "../../../shared/assistant";
import { useUnits } from "../../../shared/units";
import { signed } from "../lib/format";
import type { RotationInput, Scenario } from "../types";
import { type Draft, toRequest, type useSimulator } from "./useSimulator";
import { t } from "../../../shared/i18n";

type Sim = ReturnType<typeof useSimulator>;

/**
 * Lets the assistant (shared/assistant) set the Simulator's inputs and run it. Each changed input is reported for
 * the assistant's trace, and its control flashes (data-assist="sim.*" in the set-up panel).
 */
export function useAssistantBridge(sim: Sim, onRun?: () => void) {
  const u = useUnits();
  // The assistant sets the inputs and runs straight after, before React re-renders: run what was just set.
  const pending = useRef<Draft | null>(null);
  const { state, draft, actions } = sim;
  const options = state.options;

  const fieldName = (id: string) => options?.fields.find((f) => f.id === id)?.name ?? id;
  const projection = (id: string | null) => {
    const p = id ? options?.projections.find((x) => x.id === id) : null;
    return p ? `${p.ssp_name.split(" (")[0]}, ${p.period}` : "none";
  };
  const irrigation = (s: Scenario) => (s.irrigation === "limited" ? `limited (${u.water(s.irrigation_cap_mm ?? 0)}/season)` : s.irrigation);
  const rotations = (rs: RotationInput[]) => rs.map((r) => r.name + (r.cover_crop ? " + rye" : "")).join(", ");

  function changes(a: Draft, b: Draft): Change[] {
    const out: Change[] = [];
    const add = (label: string, before: string, after: string, assist: string) => {
      if (before !== after) out.push({ label, before, after, assist });
    };
    add(t("Field"), fieldName(a.fieldId), fieldName(b.fieldId), "sim.field");
    add(t("Rotations"), rotations(a.rotations), rotations(b.rotations), "sim.rotations");
    add(t("NASA projection"), projection(a.scenario.projection), projection(b.scenario.projection), "sim.projection");
    if (!b.scenario.projection) {
      add(t("Temperature"), u.tempDelta(a.scenario.temp_delta_c), u.tempDelta(b.scenario.temp_delta_c), "sim.temp");
      add(t("Rainfall"), `${signed(a.scenario.rain_change_pct)}%`, `${signed(b.scenario.rain_change_pct)}%`, "sim.rain");
    }
    add(t("Irrigation"), irrigation(a.scenario), irrigation(b.scenario), "sim.irrigation");
    add(t("Seasons"), String(a.scenario.years), String(b.scenario.years), "sim.years");
    add(t("Crop prices"), `${signed(a.scenario.price_change_pct)}%`, `${signed(b.scenario.price_change_pct)}%`, "sim.price");
    add(t("Response to heat"), a.scenario.heat_response, b.scenario.heat_response, "sim.heat");
    return out;
  }

  useAssistantTarget({
    page: "simulator",
    state: () => {
      const d = pending.current ?? draft;
      return { field_id: d?.fieldId ?? null, simulation: d ? { ...toRequest(d, "metric") } : null,
               has_result: !!state.result && !sim.stale };
    },
    apply: (a) => {
      const current = pending.current ?? draft;
      if (!current || !options) return [];
      if (a.type === "set_simulation") {
        const r = a.request as { field_id: string; rotations: RotationInput[]; scenario: Scenario;
                                 priorities?: Draft["priorities"] | null; include_economics?: boolean };
        const next: Draft = {
          fieldId: r.field_id, rotations: r.rotations,
          scenario: { ...current.scenario, ...r.scenario, projection: r.scenario.projection ?? null },
          priorities: r.priorities ?? current.priorities, includeEconomics: r.include_economics ?? current.includeEconomics,
        };
        pending.current = next;
        actions.replaceDraft(next);
        return changes(current, next);
      }
      if (a.type === "run_simulation") {
        pending.current = null;
        void actions.run(current);
        onRun?.();
        return [{ label: t("Ran the simulation"), assist: "sim.run" }];
      }
      if (a.type === "select_field" && a.field_id !== current.fieldId) {
        const next = { ...current, fieldId: a.field_id };
        pending.current = next;
        actions.replaceDraft(next);
        return changes(current, next);
      }
      return [];
    },
    snapshot: () => ({ draft, hadResult: !!state.result && !sim.stale }),
    restore: (s) => {
      const snap = s as { draft: Draft | null; hadResult: boolean };
      if (!snap.draft) return;
      pending.current = null;
      actions.replaceDraft(snap.draft);
      // Results are recomputed rather than stored: the model is deterministic and a run takes about a second.
      if (snap.hadResult) void actions.run(snap.draft);
    },
  }, !!draft && !!options);
}
