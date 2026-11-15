import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError } from "../../../shared/api/http";
import { useUnits } from "../../../shared/units";
import { simulatorApi } from "../api/simulatorApi";
import type {
  CropOption, IndicatorId, Priorities, RotationInput, SavedRunSummary, Scenario, SimulationRequest,
  SimulationResult, SimulatorOptions, Units,
} from "../types";
import { MAX_ROTATIONS } from "../types";
import { t } from "../../../shared/i18n";

export interface Draft {
  fieldId: string;
  rotations: RotationInput[];
  scenario: Scenario;
  priorities: Priorities;
  includeEconomics: boolean;
}

interface State {
  options: SimulatorOptions | null;
  loadError: string | null;
  draft: Draft | null;
  running: boolean;
  runError: string | null;
  result: SimulationResult | null;
  resultKey: string | null; // draft that produced the result, to mark results stale
  resultUnits: Units | null;
  savedRuns: SavedRunSummary[];
  savedError: string | null;
}

type Action =
  | { type: "loaded"; options: SimulatorOptions }
  | { type: "loadFailed"; message: string }
  | { type: "draft"; draft: Draft }
  | { type: "runStart" }
  | { type: "runDone"; result: SimulationResult; key: string; units: Units }
  | { type: "runFailed"; message: string }
  | { type: "saved"; runs: SavedRunSummary[] }
  | { type: "savedFailed"; message: string };

const initial: State = {
  options: null, loadError: null, draft: null, running: false, runError: null, result: null, resultKey: null,
  resultUnits: null, savedRuns: [], savedError: null,
};

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "loaded":
      return { ...state, options: a.options, loadError: null, draft: state.draft ?? defaultDraft(a.options) };
    case "loadFailed":
      return { ...state, loadError: a.message };
    case "draft":
      return { ...state, draft: a.draft };
    case "runStart":
      return { ...state, running: true, runError: null };
    case "runDone":
      return { ...state, running: false, result: a.result, resultKey: a.key, resultUnits: a.units };
    case "runFailed":
      return { ...state, running: false, runError: a.message };
    case "saved":
      return { ...state, savedRuns: a.runs, savedError: null };
    case "savedFailed":
      return { ...state, savedError: a.message };
  }
}

function defaultDraft(o: SimulatorOptions): Draft {
  return {
    fieldId: o.fields[0]?.id ?? "",
    rotations: o.suggested_rotations.map((r) => ({ ...r, crops: [...r.crops], cover_crop: r.cover_crop ?? false })),
    scenario: { ...o.scenario_presets[0].scenario, projection: null },
    priorities: { ...o.default_priorities },
    includeEconomics: true,
  };
}

export function toRequest(d: Draft, units: Units): SimulationRequest {
  return {
    field_id: d.fieldId,
    rotations: d.rotations,
    scenario: d.scenario,
    priorities: d.priorities,
    include_economics: d.includeEconomics,
    units,
  };
}

// Units only change sentence wording, so they don't make a result stale (a units switch re-runs instead).
const keyOf = (d: Draft) => JSON.stringify(toRequest(d, "metric"));
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

export function rotationName(crops: string[], catalogue: CropOption[]): string {
  const name = (id: string) => catalogue.find((c) => c.id === id)?.name ?? id;
  if (crops.length && crops.every((c) => c === crops[0])) return t("Continuous {toLowerCase}", { toLowerCase: name(crops[0]).toLowerCase() });
  return crops.map(name).join(" → ");
}

/** All simulator page state in one reducer: options, the draft being edited, the last result, saved runs. */
export function useSimulator(farmId: string) {
  const [state, dispatch] = useReducer(reducer, initial);
  const abort = useRef<AbortController | null>(null);
  const units = useUnits().system;

  const refreshSaved = useCallback(async () => {
    try {
      dispatch({ type: "saved", runs: await simulatorApi.listRuns(farmId) });
    } catch (e) {
      dispatch({ type: "savedFailed", message: message(e) });
    }
  }, [farmId]);

  useEffect(() => {
    const ctrl = new AbortController();
    simulatorApi.getOptions(farmId, ctrl.signal)
      .then((options) => dispatch({ type: "loaded", options }))
      .catch((e) => { if (e.name !== "AbortError") dispatch({ type: "loadFailed", message: message(e) }); });
    void refreshSaved();
    return () => ctrl.abort();
  }, [farmId, refreshSaved]);

  const draft = state.draft;
  const catalogue = state.options?.crops ?? [];
  const update = (patch: Partial<Draft>) => draft && dispatch({ type: "draft", draft: { ...draft, ...patch } });

  const run = useCallback(async (d: Draft | null = draft) => {
    if (!d) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    dispatch({ type: "runStart" });
    try {
      const result = await simulatorApi.run(farmId, toRequest(d, units), ctrl.signal);
      dispatch({ type: "runDone", result, key: keyOf(d), units });
    } catch (e) {
      if ((e as Error).name !== "AbortError") dispatch({ type: "runFailed", message: message(e) });
    }
  }, [draft, farmId, units]);

  // Switching units re-words the recommendation, so refresh a current result in the new units.
  useEffect(() => {
    if (state.result && state.resultUnits && state.resultUnits !== units && draft && state.resultKey === keyOf(draft)) {
      void run(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  const nextId = (rotations: RotationInput[]) => "ABCDEFGH".split("").find((l) => !rotations.some((r) => r.id === l))!;

  const actions = {
    /** Set every input at once (the assistant, and Undo). */
    replaceDraft: (d: Draft) => dispatch({ type: "draft", draft: d }),
    setField: (fieldId: string) => update({ fieldId }),
    setScenario: (patch: Partial<Scenario>) => draft && update({ scenario: { ...draft.scenario, ...patch } }),
    setPriority: (k: IndicatorId, v: number) =>
      draft && update({ priorities: { ...draft.priorities, [k]: v } }),
    setEconomics: (includeEconomics: boolean) => update({ includeEconomics }),
    setCrops: (rotationId: string, crops: string[]) =>
      draft && update({
        rotations: draft.rotations.map((r) => (r.id === rotationId ? { ...r, crops, name: rotationName(crops, catalogue) } : r)),
      }),
    setCoverCrop: (rotationId: string, cover_crop: boolean) =>
      draft && update({ rotations: draft.rotations.map((r) => (r.id === rotationId ? { ...r, cover_crop } : r)) }),
    addRotation: (crops: string[] = ["maize", "soybean", "winter_wheat"], cover_crop = false) => {
      if (!draft || draft.rotations.length >= MAX_ROTATIONS) return false;
      update({ rotations: [...draft.rotations, { id: nextId(draft.rotations), name: rotationName(crops, catalogue), crops, cover_crop }] });
      return true;
    },
    /** Put a suggested rotation in place of the lowest-ranked one when all four slots are full. */
    replaceRotation: (rotationId: string, crops: string[], cover_crop = false) =>
      draft && update({
        rotations: draft.rotations.map((r) => (r.id === rotationId ? { ...r, crops, cover_crop, name: rotationName(crops, catalogue) } : r)),
      }),
    removeRotation: (rotationId: string) =>
      draft && draft.rotations.length > 1 && update({ rotations: draft.rotations.filter((r) => r.id !== rotationId) }),
    run,
    save: async (name: string) => {
      if (!draft) return;
      await simulatorApi.save(farmId, name, toRequest(draft, units));
      await refreshSaved();
    },
    openSaved: async (runId: string) => {
      try {
        const saved = await simulatorApi.getRun(farmId, runId);
        const r = saved.request;
        const d: Draft = {
          fieldId: r.field_id, rotations: r.rotations,
          scenario: { ...r.scenario, projection: r.scenario.projection ?? null },
          priorities: r.priorities ?? state.options!.default_priorities, includeEconomics: r.include_economics,
        };
        dispatch({ type: "draft", draft: d });
        dispatch({ type: "runDone", result: saved.result, key: keyOf(d), units: r.units ?? "metric" });
      } catch (e) {
        dispatch({ type: "savedFailed", message: message(e) });
      }
    },
    deleteSaved: async (runId: string) => {
      try {
        await simulatorApi.deleteRun(farmId, runId);
      } finally {
        await refreshSaved();
      }
    },
  };

  const stale = !!state.result && !!draft && state.resultKey !== keyOf(draft);
  return { state, draft, stale, actions, units, farmId };
}

export type Sim = ReturnType<typeof useSimulator>;
