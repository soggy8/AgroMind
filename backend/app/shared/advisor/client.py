"""The AI advisor: answers a farmer's question from a list of facts, using an LLM.

Shared by every module. A module builds the facts (e.g. simulator.advisor.advisor_context) and the
frontend sends them here with the question; this code never imports a module.

Providers (LLM_PROVIDER in .env, or guessed from the key's prefix):
- groq (default): free tier, no card. OpenAI-compatible API, model openai/gpt-oss-120b.
- gemini, openrouter: also OpenAI-compatible; set LLM_MODEL if you want a different model.
- anthropic: Claude through the Anthropic SDK (LLM_API_KEY, or ANTHROPIC_API_KEY / `ant auth login`).
LLM_BASE_URL and LLM_MODEL override the preset for any OpenAI-compatible service.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import anthropic
import httpx

from app.core.config import get_settings

from .grounding import citations, facts_block, normalize_citations
from .prompts import SYSTEM

MAX_TURNS = 12            # earlier turns beyond this are dropped from what we send

# provider: (base URL, default model, max output tokens, spare model).
# Groq rate-limits each model separately, so when the main model's free quota is used up the assistant switches
# to the spare one instead of waiting. Empty spare = no switching.
PRESETS = {
    "groq": ("https://api.groq.com/openai/v1", "openai/gpt-oss-120b", 1500, "openai/gpt-oss-20b"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-flash-lite-latest", 1500, ""),
    "openrouter": ("https://openrouter.ai/api/v1", "openai/gpt-oss-120b:free", 1500, ""),
    "anthropic": ("", "claude-opus-5-5", 16000, ""),
}
KEY_PREFIXES = {"gsk_": "groq", "AIza": "gemini", "sk-or-": "openrouter", "sk-ant-": "anthropic"}

NOT_CONFIGURED = "The advisor isn't configured: put a free Groq API key in LLM_API_KEY in .env (see .env.example)."


class AdvisorUnavailable(RuntimeError):
    """No credentials, or the API can't be reached. The message is safe to show to users."""


@dataclass
class Answer:
    text: str
    cited_facts: list[int]
    unknown_citations: list[int]
    model: str
    refused: bool


REFUSED = "I can't help with that question. Try asking about the results on this page."


def provider() -> str:
    s = get_settings()
    if s.llm_provider:
        if s.llm_provider not in PRESETS:
            raise AdvisorUnavailable(f"LLM_PROVIDER must be one of {', '.join(PRESETS)}.")
        return s.llm_provider
    return next((p for prefix, p in KEY_PREFIXES.items() if s.llm_api_key.startswith(prefix)), "groq")


def ask(facts: list[str], instructions: str, question: str, history: list[dict], client=None) -> Answer:
    """Answer `question` from `facts`. `history` is earlier turns as {"role": "user"|"assistant", "content": str}.
    `client` replaces the real API client (tests)."""
    turns = [{"role": t["role"], "content": t["content"]} for t in history[-MAX_TURNS:]
             if t.get("role") in ("user", "assistant") and t.get("content")]
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    messages = turns + [{"role": "user", "content": question}]
    context = f"{instructions}\n\n{facts_block(facts)}"

    p = provider()
    text, model, refused = (_ask_anthropic if p == "anthropic" else _ask_openai_compatible)(p, context, messages, client)
    if refused:
        return Answer(REFUSED, [], [], model, refused=True)
    if not text:
        raise AdvisorUnavailable("The advisor didn't return an answer. Try again, or ask a shorter question.")
    text = normalize_citations(text)
    valid, unknown = citations(text, len(facts))
    return Answer(text=text, cited_facts=valid, unknown_citations=unknown, model=model, refused=False)


# ---------- OpenAI-compatible (Groq, Gemini, OpenRouter, ...) ----------

class RateLimited(AdvisorUnavailable):
    """The provider asked us to wait. `retry_after` is in seconds (None when it didn't say)."""
    def __init__(self, message: str, retry_after: float | None):
        super().__init__(message)
        self.retry_after = retry_after


class BadOutput(AdvisorUnavailable):
    """The model produced a malformed tool call (the provider rejects it). Worth one retry."""


RATE_LIMITED = ("The advisor has hit its free usage limit for now. Try again in a minute, "
                "or tomorrow if the daily limit is used up.")


def models() -> tuple[str, str]:
    """(main model, spare model) for the configured provider; the spare is the main one when there is none."""
    s = get_settings()
    _, main, _, spare = PRESETS[provider()]
    main = s.llm_model or main
    return main, s.llm_spare_model or (spare if not s.llm_model else "") or main


def complete(messages: list[dict], tools: list[dict] | None = None, max_tokens: int | None = None,
             client: httpx.Client | None = None, model: str | None = None) -> dict:
    """One chat completion with optional tools (OpenAI format). Returns {"message", "finish_reason", "model",
    "usage"}. Used by the in-app assistant; only OpenAI-compatible providers support it."""
    p = provider()
    if p == "anthropic":
        raise AdvisorUnavailable("The assistant needs an OpenAI-compatible provider: set LLM_PROVIDER to groq, "
                                 "gemini or openrouter.")
    return _post(p, messages, tools, max_tokens, client, model)


def _post(p: str, messages: list[dict], tools: list[dict] | None, max_tokens: int | None,
          client: httpx.Client | None, model: str | None = None) -> dict:
    s = get_settings()
    base, default_model, default_max, _ = PRESETS[p]
    if not s.llm_api_key:
        raise AdvisorUnavailable(NOT_CONFIGURED)
    body = {"model": model or s.llm_model or default_model, "messages": messages,
            "max_tokens": max_tokens or default_max, "temperature": 0.2}
    if tools:
        body["tools"] = tools
    if s.llm_reasoning_effort:
        body["reasoning_effort"] = s.llm_reasoning_effort
    http = client or _http()
    try:
        r = http.post(f"{(s.llm_base_url or base).rstrip('/')}/chat/completions", json=body,
                      headers={"Authorization": f"Bearer {s.llm_api_key}"})
    except httpx.HTTPError as e:
        raise AdvisorUnavailable("Couldn't reach the advisor service. Check the internet connection.") from e
    if r.status_code in (401, 403):
        raise AdvisorUnavailable("The advisor's API key was rejected. Check LLM_API_KEY in .env.")
    if r.status_code == 429:
        try:
            wait = float(r.headers.get("retry-after", ""))
        except ValueError:
            wait = None
        raise RateLimited(RATE_LIMITED, wait)
    if r.status_code == 400 and "tool_use_failed" in r.text:
        raise BadOutput("The assistant's reply came out garbled. Try again.")
    if r.status_code == 413:
        raise AdvisorUnavailable("This question and its facts are too long for the advisor's free tier.")
    if r.status_code >= 400:
        raise AdvisorUnavailable(f"The advisor service returned an error ({r.status_code}). Try again.")
    data = r.json()
    choice = data["choices"][0]
    return {"message": choice["message"], "finish_reason": choice.get("finish_reason"),
            "model": data.get("model", body["model"]), "usage": data.get("usage") or {}}


def _ask_openai_compatible(p: str, context: str, messages: list[dict], client: httpx.Client | None):
    # The stable prefix comes first, so providers that cache prompts can reuse it across questions.
    out = _post(p, [{"role": "system", "content": f"{SYSTEM}\n\n{context}"}, *messages], None, None, client)
    text = (out["message"].get("content") or "").strip()
    return text, out["model"], out["finish_reason"] == "content_filter"


@lru_cache(maxsize=1)
def _http() -> httpx.Client:
    return httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0))


# ---------- Anthropic ----------

@lru_cache(maxsize=1)
def _anthropic() -> anthropic.Anthropic:
    key = get_settings().llm_api_key
    try:
        return anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()
    except anthropic.AnthropicError as e:  # raised when no credential source is configured
        raise AdvisorUnavailable(NOT_CONFIGURED) from e


def _ask_anthropic(p: str, context: str, messages: list[dict], client=None):
    s = get_settings()
    _, default_model, max_tokens, _ = PRESETS[p]
    client = client or _anthropic()
    # Stable prefix first (system prompt, then the facts for this result), so repeated questions
    # about the same result reuse the cache; the changing conversation comes after the breakpoint.
    system = [
        {"type": "text", "text": SYSTEM},
        {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
    ]
    try:
        response = client.beta.messages.create(
            model=s.llm_model or default_model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # if a safety classifier declines, retry on a fallback model
        )
    except anthropic.AuthenticationError as e:
        raise AdvisorUnavailable("The advisor's API key was rejected. Check LLM_API_KEY or ANTHROPIC_API_KEY.") from e
    except anthropic.RateLimitError as e:
        raise AdvisorUnavailable("The advisor is busy right now. Try again in a minute.") from e
    except anthropic.APIStatusError as e:
        raise AdvisorUnavailable(f"The advisor service returned an error ({e.status_code}). Try again.") from e
    except anthropic.APIConnectionError as e:
        raise AdvisorUnavailable("Couldn't reach the advisor service. Check the internet connection.") from e
    except anthropic.AnthropicError as e:  # e.g. no credential source found when the request is built
        raise AdvisorUnavailable(NOT_CONFIGURED) from e
    except TypeError as e:
        # The SDK raises a plain TypeError when it finds no API key, auth token or credentials profile.
        if "Could not resolve authentication method" not in str(e):
            raise
        raise AdvisorUnavailable(NOT_CONFIGURED) from e
    if response.stop_reason == "refusal":
        return "", response.model, True
    return "".join(b.text for b in response.content if b.type == "text").strip(), response.model, False
