"""Shared AI advisor, tested with a fake Anthropic client (no network, no cost)."""
from types import SimpleNamespace

import anthropic
import pytest

from app.shared.advisor import client as advisor
from app.shared.advisor.grounding import citations, facts_block

FACTS = ["SCENARIO: temperature +2.0 C, rainfall -20%.", "MODELLED, rank 1: Maize → Soybean → Oats. Yield 80% of typical."]


class FakeMessages:
    def __init__(self, text="Maize → Soybean → Oats ranks first [2] under the scenario [1].", stop="end_turn"):
        self.text, self.stop, self.calls = text, stop, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(stop_reason=self.stop, model=kwargs["model"],
                               content=[SimpleNamespace(type="text", text=self.text)])


def fake(text=None, stop="end_turn"):
    msgs = FakeMessages(**({"text": text} if text else {}), stop=stop)
    return SimpleNamespace(beta=SimpleNamespace(messages=msgs)), msgs


def test_request_shape_caches_facts_and_enables_fallbacks():
    client, msgs = fake()
    history = [{"role": "assistant", "content": "orphan"}, {"role": "user", "content": "Hi"},
               {"role": "assistant", "content": "Hello"}]
    a = advisor.ask(FACTS, "Use only these facts.", "Why is it first?", history, client=client)
    call = msgs.calls[0]
    assert call["model"] == "claude-opus-5-5" and call["fallbacks"] == "default"
    assert call["system"][-1]["cache_control"] == {"type": "ephemeral"}
    assert "[1] SCENARIO" in call["system"][-1]["text"]
    assert call["messages"][0] == {"role": "user", "content": "Hi"}  # leading assistant turn dropped
    assert call["messages"][-1] == {"role": "user", "content": "Why is it first?"}
    assert a.cited_facts == [1, 2] and not a.refused


def test_refusal_is_reported_not_raised():
    client, _ = fake(stop="refusal")
    a = advisor.ask(FACTS, "", "?", [], client=client)
    assert a.refused and a.cited_facts == []


def test_citations_flag_unknown_fact_numbers():
    assert citations("See [1] and [7] and [1].", 2) == ([1], [7])
    assert facts_block(["a", "b"]).endswith("[1] a\n[2] b")


def test_api_without_credentials_returns_503(client, monkeypatch):
    def unavailable():
        raise advisor.AdvisorUnavailable("The advisor isn't configured: set ANTHROPIC_API_KEY, or LLM_API_KEY in .env.")
    monkeypatch.setattr(advisor, "_client", unavailable)
    r = client.post("/api/advisor/ask", json={"facts": FACTS, "question": "Why?"})
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_api_answer_is_marked_grounded(client, monkeypatch):
    fake_client, _ = fake()
    monkeypatch.setattr(advisor, "_client", lambda: fake_client)
    r = client.post("/api/advisor/ask", json={"facts": FACTS, "question": "Why?"}).json()
    assert r["grounded"] is True and r["cited_facts"] == [1, 2]


def test_ungrounded_answer_is_flagged(client, monkeypatch):
    fake_client, _ = fake(text="It is the best because of soil.")
    monkeypatch.setattr(advisor, "_client", lambda: fake_client)
    assert client.post("/api/advisor/ask", json={"facts": FACTS, "question": "Why?"}).json()["grounded"] is False


def test_api_errors_become_unavailable():
    class Boom:
        def create(self, **_):
            raise anthropic.APIConnectionError(request=None)  # type: ignore[arg-type]
    with pytest.raises(advisor.AdvisorUnavailable):
        advisor.ask(FACTS, "", "?", [], client=SimpleNamespace(beta=SimpleNamespace(messages=Boom())))
