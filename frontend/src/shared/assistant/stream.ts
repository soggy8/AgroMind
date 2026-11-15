import { acceptLanguage } from "../i18n";
import type { AssistantEvent, ChatRequest } from "./types";
import { t } from "../i18n";

/**
 * POST /api/farms/{farmId}/assistant/chat and hand each NDJSON event to `onEvent` as it arrives.
 * Network and HTTP failures become an "error" event, so the caller has one path for problems.
 */
export async function streamChat(farmId: string, body: ChatRequest, onEvent: (e: AssistantEvent) => void,
                                 signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/farms/${encodeURIComponent(farmId)}/assistant/chat`, {
      method: "POST", signal, headers: { "Content-Type": "application/json", "Accept-Language": acceptLanguage() },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onEvent({ type: "error", message: t("Couldn't reach the AgroMind server. Check that the backend is running.") });
    return;
  }
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : (data.detail?.[0]?.msg ?? detail);
    } catch {
      /* not JSON */
    }
    onEvent({ type: "error", message: t("The assistant couldn't start: {detail}", { detail }) });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) onEvent(JSON.parse(line) as AssistantEvent);
      }
      if (done) break;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onEvent({ type: "error", message: t("The connection to the assistant dropped. Try again.") });
  }
}
