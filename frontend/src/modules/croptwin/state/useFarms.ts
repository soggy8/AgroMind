/**
 * CropTwin: the list of farms and which one is open. The choice is remembered per browser in localStorage
 * ("agromind.croptwin.farm"); losing it only falls back to the default farm.
 */
import { useCallback, useEffect, useState } from "react";
import { croptwinApi } from "../api/croptwinApi";
import type { FarmCreate, FarmSummary } from "../types";

const KEY = "agromind.croptwin.farm";

/** Last chosen farm, remembered per browser (a convenience: losing it just falls back to the default). */
function remembered(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing to remember */
  }
}

/** Which farm is open: the remembered one if it still exists, else the demo farm, else the first. */
function pick(farms: FarmSummary[], wanted: string | null): string | null {
  if (wanted && farms.some((f) => f.id === wanted)) return wanted;
  return farms.find((f) => f.id === "demo")?.id ?? farms[0]?.id ?? null;
}

/** The farm list and the open farm. */
export function useFarms() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (prefer?: string | null) => {
    try {
      const list = await croptwinApi.listFarms();
      setFarms(list);
      setError(null);
      const id = pick(list, prefer === undefined ? remembered() : prefer);
      setSelectedId(id);
      remember(id);
      return list;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    remember(id);
  }, []);

  const create = useCallback(async (body: FarmCreate) => {
    const farm = await croptwinApi.createFarm(body);
    await refresh(farm.id);
    return farm;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await croptwinApi.deleteFarm(id);
    await refresh(id === selectedId ? null : selectedId);
  }, [refresh, selectedId]);

  return { farms, selectedId, error, refresh, select, create, remove };
}

export type Farms = ReturnType<typeof useFarms>;
