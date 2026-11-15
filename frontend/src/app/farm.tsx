/**
 * The open farm, shared by every dashboard. The top bar's farm switcher sets it; the Command Center, the Simulator
 * and the Farm profile all show it. Remembered per browser under CropTwin's key ("agromind.croptwin.farm"), and a
 * `?farm=<id>` in the page address picks it on load. The farm list itself comes from CropTwin.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { croptwinApi } from "../modules/croptwin/api/croptwinApi";
import type { FarmSummary } from "../modules/croptwin/types";

const KEY = "agromind.croptwin.farm";
export const DEMO_FARM = "demo";

function remembered(): string | null {
  const fromAddress = new URLSearchParams(window.location.search).get("farm");
  if (fromAddress) return fromAddress;
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

/** Which farm is open: the wanted one if it exists, else the demo farm, else the first. */
function pick(farms: FarmSummary[], wanted: string | null): string | null {
  if (wanted && farms.some((f) => f.id === wanted)) return wanted;
  return farms.find((f) => f.id === DEMO_FARM)?.id ?? farms[0]?.id ?? null;
}

export interface FarmChoice {
  /** null while loading. */
  farms: FarmSummary[] | null;
  /** The open farm; null when there are no farms yet. */
  selectedId: string | null;
  /** The list couldn't load (pages then fall back to the demo farm). */
  error: string | null;
  select: (id: string) => void;
  /** Reload the list; `prefer` picks the farm to open afterwards (null: the default). */
  refresh: (prefer?: string | null) => Promise<FarmSummary[] | null>;
}

const Ctx = createContext<FarmChoice | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (prefer?: string | null) => {
    try {
      const list = await croptwinApi.listFarms();
      const id = pick(list, prefer === undefined ? remembered() : prefer);
      setFarms(list);
      setError(null);
      setSelectedId(id);
      remember(id);
      return list;
    } catch (e) {
      setError((e as Error).message);
      setFarms((f) => f ?? []);
      setSelectedId((s) => s ?? remembered() ?? DEMO_FARM);
      return null;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    remember(id);
  }, []);

  const value = useMemo(() => ({ farms, selectedId, error, select, refresh }), [farms, selectedId, error, select, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFarmChoice(): FarmChoice {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFarmChoice must be used inside <FarmProvider>");
  return c;
}
