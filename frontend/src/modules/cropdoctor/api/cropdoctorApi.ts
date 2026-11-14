import { http } from "../../../shared/api/http";
import type { FarmHealth } from "../types";

export const cropdoctorApi = {
  getHealth(farmId: string, asOf?: string, signal?: AbortSignal): Promise<FarmHealth> {
    const q = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
    return http.get<FarmHealth>(`/api/farms/${encodeURIComponent(farmId)}/health${q}`, signal);
  },
};
