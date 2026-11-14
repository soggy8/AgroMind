import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError } from "../../../shared/api/http";
import { simulatorApi } from "../api/simulatorApi";
import type {
  CropOption, IndicatorId, Priorities, RotationInput, SavedRunSummary, Scenario, SimulationRequest,
  SimulationResult, SimulatorOptions,
} from "../types";
import { MAX_ROTATIONS } from "../types";

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
  savedRuns: SavedRunSummary[];
  savedError: string | null;
}

type Action =
  | { type: "loaded"; options: SimulatorOptions }
  | { type: "loadFailed"; message: string }
  | { type: "draft"; draft: Draft }
  | { type: "runStart" }
  | { type: "runDone"; result: SimulationResult; key: string }
  | { type: "runFailed"; message: string }
  | { type: "saved"; runs: SavedRunSummary[] }
  | { type: "savedFailed"; message: string };

const initial: State = {
  options: null, loadError: null, draft: null, running: false, runError: null, result: null, resultKey: null,
  savedRuns: [], savedError: null,
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
      return { ...state, running: false, result: a.result, resultKey: a.key };
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
    rotations: o.suggested_rotations.map((r) => ({ ...r, crops: [...r.crops] })),
    scenario: { ...o.scenario_presets[0].scenario },
    priorities: { ...o.default_priorities },
    includeEconomics: true,
  };
}

export function toRequest(d: Draft): SimulationRequest {
  return {
    field_id: d.fieldId,
    rotations: d.rotations,
    scenario: d.scenario,
    priorities: d.priorities,
    include_economics: d.includeEconomics,
  };
}

const keyOf = (d: Draft) => JSON.stringify(toRequest(d));
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

export function rotationName(crops: string[], catalogue: CropOption[]): string {
  const name = (id: string) => catalogue.find((c) => c.id === id)?.name ?? id;
  if (crops.length && crops.every((c) => c === crops[0])) return `Continuous ${name(crops[0]).toLowerCase()}`;
  return crops.map(name).join(" \u2192 ");
}

/** All simulator page state in one reducer: options, the draft being edited, the last result, saved runs. */
export function useSimulator(farmId: string) {
  const [state, dispatch] = useReducer(reducer, initial);
  const abort = useRef<AbortController | null>(null);

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
      const result = await simulatorApi.run(farmId, toRequest(d), ctrl.signal);
      dispatch({ type: "runDone", result, key: keyOf(d) });
    } catch (e) {
      if ((e as Error).name !== "AbortError") dispatch({ type: "runFailed", message: message(e) });
    }
  }, [draft, farmId]);

  const actions = {
    setField: (fieldId: string) => update({ fieldId }),
    setScenario: (patch: Partial<Scenario>) => draft && update({ scenario: { ...draft.scenario, ...patch } }),
    setPriority: (k: IndicatorId, v: number) =>
      draft && update({ priorities: { ...draft.priorities, [k]: v } }),
    setEconomics: (includeEconomics: boolean) => update({ includeEconomics }),
    setCrops: (rotationId: string, crops: string[]) =>
      draft && update({
        rotations: draft.rotations.map((r) => (r.id === rotationId ? { ...r, crops, name: rotationName(crops, catalogue) } : r)),
      }),
    addRotation: () => {
      if (!draft || draft.rotations.length >= MAX_ROTATIONS) return;
      const id = "ABCDEFGH".split("").find((l) => !draft.rotations.some((r) => r.id === l))!;
      const crops = ["maize", "soybean", "winter_wheat"];
      update({ rotations: [...draft.rotations, { id, name: rotationName(crops, catalogue), crops }] });
    },
    removeRotation: (rotationId: string) =>
      draft && draft.rotations.length > 1 && update({ rotations: draft.rotations.filter((r) => r.id !== rotationId) }),
    run,
    save: async (name: string) => {
      if (!draft) return;
      await simulatorApi.save(farmId, name, toRequest(draft));
      await refreshSaved();
    },
    openSaved: async (runId: string) => {
      try {
        const saved = await simulatorApi.getRun(farmId, runId);
        const r = saved.request;
        const d: Draft = {
          fieldId: r.field_id, rotations: r.rotations, scenario: r.scenario,
          priorities: r.priorities ?? state.options!.default_priorities, includeEconomics: r.include_economics,
        };
        dispatch({ type: "draft", draft: d });
        dispatch({ type: "runDone", result: saved.result, key: keyOf(d) });
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
  return { state, draft, stale, actions };
}
