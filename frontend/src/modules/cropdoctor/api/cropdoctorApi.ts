import { http } from "../../../shared/api/http";
import type { AdvisorContext, FarmHealth } from "../types";

export const cropdoctorApi = {
  getHealth(farmId: string, asOf?: string, signal?: AbortSignal): Promise<FarmHealth> {
    const q = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
    return http.get<FarmHealth>(`/api/farms/${encodeURIComponent(farmId)}/health${q}`, signal);
  },
  /** The facts the AI advisor may use, built by the backend from the health the page already shows. */
  advisorContext(farmId: string, health: FarmHealth): Promise<AdvisorContext> {
    return http.post<AdvisorContext>(`/api/farms/${encodeURIComponent(farmId)}/health/advisor-context`, health);
  },
};
