"""Shared AI advisor, tested with fake API clients (no network, no cost)."""
from types import SimpleNamespace

import anthropic
import httpx
import pytest

from app.core.config import get_settings
from app.shared.advisor import client as advisor
from app.shared.advisor.grounding import citations, facts_block

FACTS = ["SCENARIO: temperature +2.0 C, rainfall -20%.", "MODELLED, rank 1: Maize → Soybean → Oats. Yield 80% of typical."]
ANSWER = "Maize → Soybean → Oats ranks first [2] under the scenario [1]."


@pytest.fixture
def settings(monkeypatch):
    s = get_settings()
    def set_(**kw):
        for k, v in kw.items():
            monkeypatch.setattr(s, k, v)
    set_(llm_api_key="", llm_provider="", llm_model="", llm_base_url="", llm_reasoning_effort="low")
    return set_


# ---------- OpenAI-compatible (Groq by default) ----------

class FakeHttp:
    def __init__(self, text=ANSWER, status=200, finish="stop"):
        self.text, self.status, self.finish, self.calls = text, status, finish, []

    def post(self, url, json, headers):
        self.calls.append({"url": url, "json": json, "headers": headers})
        body = {"model": json["model"], "choices": [{"message": {"content": self.text}, "finish_reason": self.finish}]}
        return httpx.Response(self.status, json=body)


def test_provider_is_guessed_from_the_key(settings):
    for key, p in [("gsk_x", "groq"), ("AIzaX", "gemini"), ("sk-or-x", "openrouter"), ("sk-ant-x", "anthropic"), ("", "groq")]:
        settings(llm_api_key=key)
        assert advisor.provider() == p
    settings(llm_api_key="gsk_x", llm_provider="anthropic")
    assert advisor.provider() == "anthropic"


def test_groq_request_shape(settings):
    settings(llm_api_key="gsk_test")
    http = FakeHttp()
    history = [{"role": "assistant", "content": "orphan"}, {"role": "user", "content": "Hi"},
               {"role": "assistant", "content": "Hello"}]
    a = advisor.ask(FACTS, "Use only these facts.", "Why is it first?", history, client=http)
    call = http.calls[0]
    assert call["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer gsk_test"
    body = call["json"]
    assert body["model"] == "openai/gpt-oss-120b" and body["reasoning_effort"] == "low"
    assert body["max_tokens"] <= 2000  # free tiers count it against tokens per minute
    assert body["messages"][0]["role"] == "system" and "[1] SCENARIO" in body["messages"][0]["content"]
    assert body["messages"][1] == {"role": "user", "content": "Hi"}  # leading assistant turn dropped
    assert body["messages"][-1] == {"role": "user", "content": "Why is it first?"}
    assert a.cited_facts == [1, 2] and not a.refused


def test_overrides_and_no_reasoning_effort(settings):
    settings(llm_api_key="k", llm_provider="groq", llm_model="m", llm_base_url="https://x.test/v1/", llm_reasoning_effort="")
    http = FakeHttp()
    advisor.ask(FACTS, "", "?", [], client=http)
    assert http.calls[0]["url"] == "https://x.test/v1/chat/completions"
    assert http.calls[0]["json"]["model"] == "m" and "reasoning_effort" not in http.calls[0]["json"]


@pytest.mark.parametrize("status,words", [(401, "rejected"), (429, "free usage limit"), (413, "too long"), (500, "500")])
def test_http_errors_become_unavailable(settings, status, words):
    settings(llm_api_key="gsk_test")
    with pytest.raises(advisor.AdvisorUnavailable, match=words):
        advisor.ask(FACTS, "", "?", [], client=FakeHttp(status=status))


def test_missing_key_and_empty_answer(settings):
    with pytest.raises(advisor.AdvisorUnavailable, match="LLM_API_KEY"):
        advisor.ask(FACTS, "", "?", [], client=FakeHttp())
    settings(llm_api_key="gsk_test")
    with pytest.raises(advisor.AdvisorUnavailable, match="didn't return"):
        advisor.ask(FACTS, "", "?", [], client=FakeHttp(text=""))


def test_content_filter_is_a_refusal(settings):
    settings(llm_api_key="gsk_test")
    a = advisor.ask(FACTS, "", "?", [], client=FakeHttp(text="", finish="content_filter"))
    assert a.refused and a.cited_facts == []


# ---------- Anthropic ----------

class FakeMessages:
    def __init__(self, text=ANSWER, stop="end_turn"):
        self.text, self.stop, self.calls = text, stop, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(stop_reason=self.stop, model=kwargs["model"],
                               content=[SimpleNamespace(type="text", text=self.text)])


def fake_anthropic(stop="end_turn"):
    msgs = FakeMessages(stop=stop)
    return SimpleNamespace(beta=SimpleNamespace(messages=msgs)), msgs


def test_anthropic_caches_facts_and_enables_fallbacks(settings):
    settings(llm_provider="anthropic")
    client, msgs = fake_anthropic()
    a = advisor.ask(FACTS, "Use only these facts.", "Why is it first?", [], client=client)
    call = msgs.calls[0]
    assert call["model"] == "claude-opus-5-5" and call["fallbacks"] == "default"
    assert call["system"][-1]["cache_control"] == {"type": "ephemeral"}
    assert "[1] SCENARIO" in call["system"][-1]["text"]
    assert a.cited_facts == [1, 2] and not a.refused


def test_anthropic_refusal_is_reported_not_raised(settings):
    settings(llm_provider="anthropic")
    client, _ = fake_anthropic(stop="refusal")
    a = advisor.ask(FACTS, "", "?", [], client=client)
    assert a.refused and a.cited_facts == []


def test_anthropic_errors_become_unavailable(settings):
    settings(llm_provider="anthropic")
    class Boom:
        def create(self, **_):
            raise anthropic.APIConnectionError(request=None)  # type: ignore[arg-type]
    with pytest.raises(advisor.AdvisorUnavailable):
        advisor.ask(FACTS, "", "?", [], client=SimpleNamespace(beta=SimpleNamespace(messages=Boom())))


# ---------- grounding and HTTP ----------

def test_citation_styles_are_normalised():
    from app.shared.advisor.grounding import normalize_citations as n
    assert n("a 【5】 b 【23†L1-L3】") == "a [5] b [23]"
    assert n("see [2, 5] and [27‑30] and [3]") == "see [2][5] and [27][28][29][30] and [3]"


def test_citations_flag_unknown_fact_numbers():
    assert citations("See [1] and [7] and [1].", 2) == ([1], [7])
    assert facts_block(["a", "b"]).endswith("[1] a\n[2] b")


def test_api_without_credentials_returns_503(client, settings):
    r = client.post("/api/advisor/ask", json={"facts": FACTS, "question": "Why?"})
    assert r.status_code == 503 and "LLM_API_KEY" in r.json()["detail"]


def test_api_answer_is_marked_grounded(client, settings, monkeypatch):
    settings(llm_api_key="gsk_test")
    monkeypatch.setattr(advisor, "_http", lambda: FakeHttp())
    r = client.post("/api/advisor/ask", json={"facts": FACTS, "question": "Why?"}).json()
    assert r["grounded"] is True and r["cited_facts"] == [1, 2]


def test_ungrounded_answer_is_flagged(client, settings, monkeypatch):
    settings(llm_api_key="gsk_test")
    monkeypatch.setattr(advisor, "_http", lambda: FakeHttp(text="It is the best because of soil."))
    assert client.post("/api/advisor/ask", json={"facts": FACTS, "question": "Why?"}).json()["grounded"] is False
