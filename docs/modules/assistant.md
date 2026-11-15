# Assistant

AgroMind's own AI: the farmer asks in words ("show me March 2016", "make it 2 degrees hotter with full
irrigation", "West Field is soybean now") and the assistant operates the site. It opens pages, sets dates and
simulator inputs, runs simulations, and points at fields, and the farmer sees each change happen. Answers come only
from numbered facts the modules build and cite them, like the advisor's.

**Status (2026-11-14): built end to end.** Backend `backend/app/modules/assistant/` (tests in `tests/assistant/`),
frontend `frontend/src/shared/assistant/` plus one `state/useAssistantBridge.ts` per module (e2e:
`frontend/e2e/assistant.spec.ts`, with the chat endpoint mocked). "Ask the advisor" in the top bar and Ctrl+K open it;
it replaced the advisor drawers.

## 1. How it works

```
browser ── POST /api/farms/{farm_id}/assistant/chat ──► agent.run
  question, history, facts so far, page state            │  model call with tools (shared/advisor/client.complete)
                                                         │  tool → UI actions + numbered facts (tools.py)
  ◄── NDJSON events: status, action, facts, waiting ─────┤  model call without tools → answer
  ◄── answer (text, cited_facts, grounded) ──────────────┘
```

- `ports.py` is the only file that reads other modules (CropTwin, CropDoctor, Simulator), each through its
  `service.py`. The fact lists are the modules' own `advisor.py` builders, so the advisor and the assistant say the
  same things.
- The assistant never writes. Farm-profile changes come back as `propose_change` actions; the farmer confirms each
  one on a card and the browser saves it through CropTwin's normal API.
- Page state (current page, field, Command Center date, Simulator request) comes with each question, so "this
  field" and "make it hotter" work. `run_simulation` changes only the inputs the farmer named.

## 2. API

`POST /api/farms/{farm_id}/assistant/chat`: body `ChatRequest` (`schemas.py`), response
`application/x-ndjson`, one event per line:

| Event | Fields | Browser |
|---|---|---|
| `status` | `text` | a step in the trace ("Opening the Command Center at 31 Mar 2016") |
| `action` | `action` (below) | apply it, show what changed, keep it for Undo |
| `facts` | `start`, `facts` | append to the conversation's facts (numbered from `start`) |
| `waiting` | `seconds` | "Waiting for free quota…"; the server retries |
| `answer` | `text`, `cited_facts`, `grounded`, `model` | the reply; flag it if not grounded |
| `error` | `message` | show it; the turn ends |

Actions:

| `type` | Fields | Applies to |
|---|---|---|
| `navigate` | `page` | app shell |
| `set_date` | `date` | Command Center |
| `set_layer` | `layer` (`greenness`, `satellite`) | Command Center |
| `select_field` | `field_id` | current page |
| `set_simulation` | `request` (a full `SimulationRequest`) | Simulator draft |
| `run_simulation` | | Simulator |
| `highlight_fields` | `field_ids` | map: pulse these outlines |
| `open_report` | `title` | show the answer as a printable page with its cited facts |
| `propose_change` | `id`, `title`, `change`, `summary` | confirm card; on confirm call CropTwin's API |

`propose_change.change.kind`: `update_field` (PATCH the field), `add_crop_history` (POST crop history),
`update_farm` (PATCH the farm), `draw_new_field` (start drawing with name, crop, irrigation, texture prefilled).

## 3. Frontend

- `frontend/src/shared/assistant/`: `types.ts` (mirror of `schemas.py` plus the event and action types),
  `AssistantProvider.tsx` (conversation, action queue, Undo, page registry), `AssistantPanel.tsx` (the console,
  docked at the bottom of the map between the side panels), `AssistantChat.tsx` (the full-page ChatGPT-style chat on
  the Overview; same conversation, and the docked console hides there), `Thread.tsx` (the turns, steps, confirm
  cards and question box both use), `AnswerText.tsx` (light Markdown, no HTML from the
  model), `ReportView.tsx` (printable report), `stream.ts` (NDJSON reader).
- Each dashboard registers what the assistant may change with `useAssistantTarget` in its module's
  `state/useAssistantBridge.ts`, once the page has loaded. The farm profile's bridge also saves confirmed changes
  through CropTwin's API (it refuses while that field or the farm has unsaved edits). Overview is opened but not
  operated.
- Action trace in the chat: each status and action as a step, with before → after values
  ("Date: 12 Aug 2012 → 31 Mar 2016", "Rain: 0% → −20%").
- Every control the assistant changes glows briefly and scrolls into view (`data-assist="sim.rain"` etc.).
- One Undo per turn restores the page state from before the turn.
- Map: `highlight_fields` pulses the field outlines.
- Ctrl/Cmd+K opens the panel from anywhere; the conversation persists across pages.
- Answers render light Markdown (bold, lists); citations link to the facts list.

## 4. Free-tier budget (Groq)

`openai/gpt-oss-120b` on Groq's free tier allows 8,000 tokens a minute and 1,000 requests a day, and doesn't cache
prompts. Measured on the demo farm: the rules about 390 tokens, the tool schemas about 660, and one tool's facts
1,000 to 1,300. A turn that runs one tool costs two model calls, about 4,000 to 6,000 tokens, so about one turn a
minute before the server starts waiting. To keep it down:

- Tool schemas are short and carry no long enums; the server validates and explains bad values.
- After a tool returns facts, the answer call doesn't resend the tool schemas.
- Only the latest 40 facts and 6 chat turns go back to the model (older facts keep their numbers on screen).
- Fields named in an answer pulse on the map automatically, with no extra call.

Groq's paid Developer tier raises the limits about tenfold.

## 5. Known limits

- The model can misread a request (it once turned "current crop soybean, maize in 2024" into one soybean entry).
  The confirm card shows exactly what would change, so the farmer catches it; nothing is saved without them.
- Greenness comparisons need at least 7 earlier years of the same period, so some dates show "not enough earlier
  years to compare" and the assistant says so.
