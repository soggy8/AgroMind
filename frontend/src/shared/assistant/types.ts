/**
 * The assistant's API contract. Mirrors backend/app/modules/assistant/schemas.py (request) and the events and
 * actions documented in agent.py and tools.py: change them together (docs/modules/assistant.md).
 */

export type AssistantPage = "home" | "overview" | "command-center" | "simulator" | "farm-profile";
/** Pages the assistant operates (registers a PageTarget on). */
export type AppPage = Exclude<AssistantPage, "home" | "overview">;

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** What the farmer is looking at. `simulation` is the Simulator's current SimulationRequest. */
export interface PageState {
  page: AssistantPage;
  field_id?: string | null;
  as_of?: string | null;
  layer?: string | null;
  simulation?: Record<string, unknown> | null;
  has_result?: boolean;
}

export interface ChatRequest {
  question: string;
  history: Turn[];
  facts: string[];
  page: PageState;
}

// ---------- proposed farm changes (applied by the farm profile after the farmer confirms) ----------

export type ProposedChange =
  | { kind: "update_field"; field_id: string; name?: string; current_crop_id?: string; irrigation_available?: boolean;
      soil_texture?: string; area_ha?: number }
  | { kind: "add_crop_history"; field_id: string; season_year: number; crop_id: string; yield_value: number | null;
      yield_unit: string | null; notes: string | null; source: string }
  | { kind: "update_farm"; name?: string; region?: string; constraints?: string; priorities?: Record<string, number> }
  | { kind: "draw_new_field"; name: string; current_crop_id: string | null; irrigation_available: boolean;
      soil_texture: string | null };

// ---------- actions (the browser applies them) ----------

export type AssistantAction =
  | { type: "navigate"; page: Exclude<AssistantPage, "home"> }
  | { type: "set_date"; date: string }
  | { type: "set_layer"; layer: string }
  | { type: "select_field"; field_id: string; field_name?: string }
  | { type: "set_simulation"; request: Record<string, unknown> }
  | { type: "run_simulation" }
  | { type: "highlight_fields"; field_ids: string[] }
  | { type: "open_report"; title: string }
  | { type: "propose_change"; id: string; title: string; change: ProposedChange; summary: string[] };

// ---------- streamed events ----------

export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "action"; action: AssistantAction }
  | { type: "facts"; start: number; facts: string[] }
  | { type: "waiting"; seconds: number }
  | { type: "answer"; text: string; cited_facts: number[]; grounded: boolean; model: string }
  | { type: "error"; message: string };
