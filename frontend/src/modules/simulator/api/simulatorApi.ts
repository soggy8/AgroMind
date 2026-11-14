import { http } from "../../../shared/api/http";
import type {
  AdvisorAnswer, AdvisorContext, AdvisorTurn, FinderRequest, FinderResult, IrrigationPlan, IrrigationPlanRequest,
  SavedRun, SavedRunSummary, SimulationRequest, SimulationResult, SimulatorOptions,
} from "../types";

const base = (farmId: string) => `/api/farms/${encodeURIComponent(farmId)}/simulations`;

export const simulatorApi = {
  getOptions: (farmId: string, signal?: AbortSignal) => http.get<SimulatorOptions>(`${base(farmId)}/options`, signal),
  run: (farmId: string, req: SimulationRequest, signal?: AbortSignal) =>
    http.post<SimulationResult>(`${base(farmId)}/run`, req, signal),
  find: (farmId: string, req: FinderRequest, signal?: AbortSignal) =>
    http.post<FinderResult>(`${base(farmId)}/find`, req, signal),
  irrigationPlan: (farmId: string, req: IrrigationPlanRequest, signal?: AbortSignal) =>
    http.post<IrrigationPlan>(`${base(farmId)}/irrigation-plan`, req, signal),
  advisorContext: (farmId: string, result: SimulationResult) =>
    http.post<AdvisorContext>(`${base(farmId)}/advisor-context`, result),
  ask: (facts: string[], instructions: string, question: string, history: AdvisorTurn[]) =>
    http.post<AdvisorAnswer>("/api/advisor/ask", { facts, instructions, question, history }),
  save: (farmId: string, name: string, request: SimulationRequest) =>
    http.post<SavedRun>(base(farmId), { name, request }),
  listRuns: (farmId: string) => http.get<SavedRunSummary[]>(base(farmId)),
  getRun: (farmId: string, runId: string) => http.get<SavedRun>(`${base(farmId)}/${encodeURIComponent(runId)}`),
  deleteRun: (farmId: string, runId: string) => http.del(`${base(farmId)}/${encodeURIComponent(runId)}`),
};
