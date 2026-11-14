"""The AI advisor: answers a farmer's question from a list of facts, using Claude.

Shared by every module. A module builds the facts (e.g. simulator.advisor.advisor_context) and the
frontend sends them here with the question; this code never imports a module.

Credentials: LLM_API_KEY from settings if set, otherwise the Anthropic SDK's own resolution
(ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile).
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import anthropic

from app.core.config import get_settings

from .grounding import citations, facts_block
from .prompts import SYSTEM

MODEL = "claude-opus-5-5"
MAX_TURNS = 12            # earlier turns beyond this are dropped from what we send
MAX_TOKENS = 16000


NOT_CONFIGURED = "The advisor isn't configured: set ANTHROPIC_API_KEY, or LLM_API_KEY in .env."


class AdvisorUnavailable(RuntimeError):
    """No credentials, or the API can't be reached. The message is safe to show to users."""


@dataclass
class Answer:
    text: str
    cited_facts: list[int]
    unknown_citations: list[int]
    model: str
    refused: bool


@lru_cache(maxsize=1)
def _client() -> anthropic.Anthropic:
    key = get_settings().llm_api_key
    try:
        return anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()
    except anthropic.AnthropicError as e:  # raised when no credential source is configured
        raise AdvisorUnavailable(NOT_CONFIGURED) from e


def ask(facts: list[str], instructions: str, question: str, history: list[dict], client=None) -> Answer:
    """Answer `question` from `facts`. `history` is earlier turns as {"role": "user"|"assistant", "content": str}."""
    client = client or _client()
    # Stable prefix first (system prompt, then the facts for this result), so repeated questions
    # about the same result reuse the cache; the changing conversation comes after the breakpoint.
    system = [
        {"type": "text", "text": SYSTEM},
        {"type": "text", "text": f"{instructions}\n\n{facts_block(facts)}", "cache_control": {"type": "ephemeral"}},
    ]
    turns = [{"role": t["role"], "content": t["content"]} for t in history[-MAX_TURNS:]
             if t.get("role") in ("user", "assistant") and t.get("content")]
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    messages = turns + [{"role": "user", "content": question}]

    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=messages,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # if a safety classifier declines, retry on a fallback model
        )
    except anthropic.AuthenticationError as e:
        raise AdvisorUnavailable("The advisor's API key was rejected. Check ANTHROPIC_API_KEY or LLM_API_KEY.") from e
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
        return Answer("I can't help with that question. Try asking about the simulation results.", [], [],
                      response.model, refused=True)
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    valid, unknown = citations(text, len(facts))
    return Answer(text=text, cited_facts=valid, unknown_citations=unknown, model=response.model, refused=False)
