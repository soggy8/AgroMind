import { http } from "../../../shared/api/http";
import type {
  AdvisorContext, SavedRun, SavedRunSummary, SimulationRequest, SimulationResult, SimulatorOptions,
} from "../types";

const base = (farmId: string) => `/api/farms/${encodeURIComponent(farmId)}/simulations`;

export const simulatorApi = {
  getOptions: (farmId: string, signal?: AbortSignal) => http.get<SimulatorOptions>(`${base(farmId)}/options`, signal),
  run: (farmId: string, req: SimulationRequest, signal?: AbortSignal) =>
    http.post<SimulationResult>(`${base(farmId)}/run`, req, signal),
  advisorContext: (farmId: string, result: SimulationResult) =>
    http.post<AdvisorContext>(`${base(farmId)}/advisor-context`, result),
  save: (farmId: string, name: string, request: SimulationRequest) =>
    http.post<SavedRun>(base(farmId), { name, request }),
  listRuns: (farmId: string) => http.get<SavedRunSummary[]>(base(farmId)),
  getRun: (farmId: string, runId: string) => http.get<SavedRun>(`${base(farmId)}/${encodeURIComponent(runId)}`),
  deleteRun: (farmId: string, runId: string) => http.del(`${base(farmId)}/${encodeURIComponent(runId)}`),
};
