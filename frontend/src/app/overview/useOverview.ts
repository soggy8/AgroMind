/**
 * Everything the Overview shows, read from the three modules' own APIs in parallel. Each part loads and fails on its
 * own, so one module being down never blanks the page.
 */
import { useEffect, useState } from "react";
import { cropdoctorApi } from "../../modules/cropdoctor/api/cropdoctorApi";
import type { FarmHealth } from "../../modules/cropdoctor/types";
import { croptwinApi } from "../../modules/croptwin/api/croptwinApi";
import type { FarmOut } from "../../modules/croptwin/types";
import { simulatorApi } from "../../modules/simulator/api/simulatorApi";
import type { SavedRunSummary } from "../../modules/simulator/types";

export interface Part<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

const loading = <T,>(): Part<T> => ({ data: null, error: null, loading: true });

function usePart<T>(load: (signal: AbortSignal) => Promise<T>, key: string): Part<T> {
  const [part, setPart] = useState<Part<T>>(loading);
  useEffect(() => {
    const ctrl = new AbortController();
    setPart(loading());
    load(ctrl.signal)
      .then((data) => setPart({ data, error: null, loading: false }))
      .catch((e: Error) => { if (e.name !== "AbortError") setPart({ data: null, error: e.message, loading: false }); });
    return () => ctrl.abort();
    // `load` is rebuilt every render; `key` says when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return part;
}

export interface Overview {
  farm: Part<FarmOut>;
  health: Part<FarmHealth>;
  runs: Part<SavedRunSummary[]>;
}

export function useOverview(farmId: string): Overview {
  const farm = usePart((s) => croptwinApi.getFarm(farmId, s), farmId);
  const health = usePart((s) => cropdoctorApi.getHealth(farmId, undefined, s), farmId);
  // Newest first, whatever order the API keeps.
  const runs = usePart(async () => [...(await simulatorApi.listRuns(farmId))]
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), farmId);
  return { farm, health, runs };
}
