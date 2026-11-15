import { http } from "../../../shared/api/http";
import type { EconomicsDefaults, EconomicsReport, EconomicsRequest } from "../types";

const base = (farmId: string) => `/api/farms/${encodeURIComponent(farmId)}/economics`;

export const economicsApi = {
  defaults: (farmId: string, signal?: AbortSignal) => http.get<EconomicsDefaults>(`${base(farmId)}/defaults`, signal),
  report: (farmId: string, req: EconomicsRequest, signal?: AbortSignal) =>
    http.post<EconomicsReport>(`${base(farmId)}/report`, req, signal),
};
