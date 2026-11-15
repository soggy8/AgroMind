"""The assistant's loop: ask the model, run the tools it calls, stream what happens, answer from the facts.

Events (one JSON object per line):
  {"type": "status", "text": str}                         a tool is running (shown as a step)
  {"type": "action", "action": {...}}                     the browser applies it (see tools.py)
  {"type": "facts", "start": int, "facts": [str]}        new facts, numbered from `start`
  {"type": "waiting", "seconds": float}                   the free tier asked us to wait; retrying
  {"type": "answer", "text": str, "cited_facts": [int], "grounded": bool, "model": str}
  {"type": "error", "message": str}                       safe to show; the turn ends
"""
from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from datetime import date

from sqlalchemy.orm import Session

from app.shared import i18n
from app.shared.advisor import client as llm
from app.shared.advisor.grounding import citations, normalize_citations

from . import ports, tools
from .schemas import ChatRequest, PageState

MAX_STEPS = 5            # model calls per turn
MAX_WAIT_S = 60          # total time we wait on the free tier's rate limit per turn
MAX_TURNS = 6            # earlier chat turns sent to the model
MAX_PROMPT_FACTS = 40    # most recent facts sent back (older ones stay numbered on screen, unsent)

PAGE_NAMES = {"home": "the landing page", "overview": "the farm overview", "command-center": "the Command Center", "simulator": "the Simulator",
              "economics": "the farm money page (climate bill, bad-year money, who earns most)",
              "farm-profile": "the farm profile"}

RULES = """You are AgroMind's assistant, built into the AgroMind website, a digital twin of a farm. You operate \
the site for the farmer with your tools: they open pages, change dates and settings, run simulations and return \
numbered facts. The farmer watches every change on screen.

How to work:
- To show, change or run anything, call a tool. Never say you changed or opened something unless a tool did it.
- Answer only from the numbered facts. Cite them in square brackets like [3] or [2][5]. Don't add measurements, yields, prices or \
research of your own. If the facts can't answer, say so in one sentence and say what would (a field check, a \
soil test, a local agronomist, or a named change to the simulation).
- Say whether a number is OBSERVED, MODELLED or SCENARIO when it matters. A scenario is a what-if, not a forecast.
- Simulation results: lead with the change against today's climate. Don't present t/ha as a prediction.
- Crop health: findings are possibilities. Say "may"; never "detected", "caused by" or "confirmed". Satellites \
can't rule out pests or disease.
- You can't save or edit anything. For farm profile changes call the propose_ tools; the farmer confirms them \
on screen. Never say a change is saved. If the farmer states several changes, propose each one.
- Be brief: two to five short sentences, or a short list. No headings, except in a report."""


def _describe_page(ctx: tools.Context) -> str:
    p = ctx.page
    out = [f"The farmer is on {PAGE_NAMES.get(p.page, p.page)}."]
    if p.field_id:
        out.append(f"Selected field: {ctx.field_name(p.field_id)} ({p.field_id}).")
    if p.page == "command-center" and p.as_of:
        out.append(f"Command Center date: {p.as_of.isoformat()}.")
    if p.simulation:
        sc = p.simulation.get("scenario", {})
        rots = ", ".join(r.get("name", "?") for r in p.simulation.get("rotations", []))
        climate = (f"projection {sc['projection']}" if sc.get("projection")
                   else f"temperature {sc.get('temp_delta_c', 0):+g} C, rain {sc.get('rain_change_pct', 0):+g}%")
        out.append(f"Simulator settings: field {p.simulation.get('field_id')}, {climate}, irrigation "
                   f"{sc.get('irrigation', 'none')}, {sc.get('years', 5)} years, rotations: {rots}"
                   + (" (results shown)." if p.has_result else " (not run yet)."))
    return " ".join(out)


def system_prompt(ctx: tools.Context, today: date) -> str:
    f = ctx.farm
    fields = "; ".join(f"{x.id} = {x.name}" for x in f.fields) or "none yet"
    parts = [RULES, "",
             f"Today is {today.isoformat()}. Farm: {f.name}" + (f", {f.region}" if f.region else "") + f". Fields: {fields}.",
             "Pages: Command Center (crop greenness from NASA satellites and NASA POWER weather against normal, for "
             "any past date), Simulator (crop rotations under climate scenarios), farm profile (fields, soil, crop history).",
             _describe_page(ctx)]
    if ctx.facts:
        first = max(0, len(ctx.facts) - MAX_PROMPT_FACTS)
        parts += ["", "Facts from earlier in this conversation:",
                  *(f"[{i}] {f}" for i, f in enumerate(ctx.facts[first:], start=first + 1))]
    return "\n".join(parts)


class _GaveUp(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


MACEDONIAN = ("\n- Write every answer in Macedonian, in Cyrillic. The facts are in English: translate what you use, and keep "
              "numbers, units, names and fact numbers as they are.")


def run(session: Session, farm_id: str, req: ChatRequest, *, complete: Callable | None = None,
        sleep: Callable[[float], None] = time.sleep, today: date | None = None, lang: str = "en") -> Iterator[dict]:
    """One turn. Yields events in the farmer's language (`lang`); never raises for problems the farmer should see."""
    for event in _run(session, farm_id, req, complete=complete, sleep=sleep, today=today, lang=lang):
        yield _translated(event, lang)


def _translated(e: dict, lang: str) -> dict:
    """The text in an event in `lang` (the model's own answer is already written in it)."""
    if lang == "en":
        return e
    tr = lambda s: i18n.translate(s, lang)  # noqa: E731
    if e["type"] == "facts":
        return {**e, "facts": [tr(f) for f in e["facts"]]}
    if e["type"] == "error":
        return {**e, "message": tr(e["message"])}
    if e["type"] == "answer" and not e.get("model"):   # the fallback answer is ours, not the model's
        return {**e, "text": tr(e["text"])}
    if e["type"] == "action" and e["action"]["type"] == "propose_change":
        a = e["action"]
        return {**e, "action": {**a, "title": tr(a["title"]), "summary": [tr(s) for s in a["summary"]]}}
    return e


def _run(session: Session, farm_id: str, req: ChatRequest, *, complete: Callable | None,
         sleep: Callable[[float], None], today: date | None, lang: str) -> Iterator[dict]:
    complete = complete or llm.complete   # looked up per call, so tests can replace it
    today = today or date.today()
    try:
        farm = ports.farm(session, farm_id)
        main_model, spare_model = llm.models()
    except (ports.NotFound, llm.AdvisorUnavailable) as e:
        yield {"type": "error", "message": str(e)}
        return
    ctx = tools.Context(session=session, farm_id=farm_id, page=req.page or PageState(), facts=list(req.facts), farm=farm)

    history = [{"role": t.role, "content": t.content} for t in req.history[-MAX_TURNS:]]
    while history and history[0]["role"] != "user":
        history.pop(0)
    messages = [{"role": "system", "content": system_prompt(ctx, today) + (MACEDONIAN if lang == "mk" else "")}, *history,
                {"role": "user", "content": req.question}]
    schemas = tools.schemas(ctx)
    waited = 0.0
    done: list[str] = []   # what the tools did this turn, for the fallback answer

    def ask() -> Iterator[dict]:
        """Call the model; on the free tier's rate limit try the spare model, then wait. The reply arrives as
        {"type": "_reply"}."""
        nonlocal waited
        order = [main_model] + ([spare_model] if spare_model != main_model else [])
        retried = False
        while True:
            limited: list[llm.RateLimited] = []
            for model in order:
                try:
                    yield {"type": "_reply", "out": complete(messages, schemas, model=model)}
                    return
                except llm.RateLimited as e:
                    limited.append(e)
                except llm.BadOutput as e:
                    if retried:
                        raise _GaveUp(str(e)) from e
                    retried = True
                    break
                except llm.AdvisorUnavailable as e:
                    raise _GaveUp(str(e)) from e
            if not limited:
                continue    # a garbled reply: retry once
            wait = min(min(e.retry_after or 10.0 for e in limited), 30.0)
            if waited + wait > MAX_WAIT_S:
                raise _GaveUp(str(limited[0]))
            waited += wait
            yield {"type": "waiting", "seconds": round(wait, 1)}
            sleep(wait)

    try:
        for step in range(MAX_STEPS):
            out = None
            for e in ask():
                if e["type"] == "_reply":
                    out = e["out"]
                else:
                    yield e

            msg = out["message"]
            calls = msg.get("tool_calls") or []
            if not calls:
                if out.get("finish_reason") == "content_filter":
                    yield {"type": "error", "message": llm.REFUSED}
                    return
                text = normalize_citations((msg.get("content") or "").strip())
                if not text:
                    raise _GaveUp("The assistant didn't return an answer. Try again, or ask a shorter question.")
                if mentioned := tools.fields_mentioned(ctx, text):
                    yield {"type": "action", "action": {"type": "highlight_fields", "field_ids": mentioned}}
                valid, unknown = citations(text, len(ctx.facts))
                yield {"type": "answer", "text": text, "cited_facts": valid,
                       "grounded": bool(valid) and not unknown, "model": out.get("model", "")}
                return

            # Echo the calls back without the provider's reasoning field, then answer each in order.
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": [
                {"id": c["id"], "type": "function", "function": {"name": c["function"]["name"],
                                                                 "arguments": c["function"].get("arguments") or "{}"}}
                for c in calls]})
            for c in calls:
                name, raw = c["function"]["name"], c["function"].get("arguments")
                status = tools.describe(ctx, name, raw, lambda s: i18n.translate(s, lang))
                yield {"type": "status", "text": status}
                outcome = tools.execute(ctx, name, raw)
                for a in outcome.actions:
                    yield {"type": "action", "action": a}
                if outcome.facts:
                    yield {"type": "facts", "start": len(ctx.facts) + 1, "facts": outcome.facts}
                    ctx.facts += outcome.facts
                if not outcome.result.startswith("Error:"):
                    done.append(status)
                messages.append({"role": "tool", "tool_call_id": c["id"], "content": outcome.result})
        raise _GaveUp("The assistant took too many steps. Try a simpler request.")
    except _GaveUp as e:
        if done:
            # The page already changed; say what was done rather than failing the whole turn.
            yield {"type": "answer", "text": "Done: " + "; ".join(done) + f". I couldn't write an explanation: {e.message}",
                   "cited_facts": [], "grounded": False, "model": ""}
        else:
            yield {"type": "error", "message": e.message}
