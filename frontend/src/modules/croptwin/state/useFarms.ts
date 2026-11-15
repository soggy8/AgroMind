/**
 * CropTwin: the list of farms and which one is open. The list and the choice are the app's shared farm choice
 * (src/app/farm.tsx), so the farm open here is the farm every dashboard shows; this hook adds create and delete.
 */
import { useCallback } from "react";
import { useFarmChoice } from "../../../app/farm";
import { croptwinApi } from "../api/croptwinApi";
import type { FarmCreate } from "../types";

/** The farm list and the open farm. */
export function useFarms() {
  const { farms, selectedId, error, refresh, select } = useFarmChoice();

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
