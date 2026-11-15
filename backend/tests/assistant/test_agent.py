"""The in-app assistant, driven by a scripted fake model (no network, no cost)."""
import json
from datetime import date

import pytest

from app.modules.assistant import agent
from app.modules.assistant.schemas import ChatRequest, PageState
from app.modules.croptwin.seed import seed_demo_farm
from app.shared.advisor import client as llm


def call(name, **args):
    return {"id": f"c-{name}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


class Script:
    """Returns the scripted model replies in order and records what it was sent."""
    def __init__(self, *replies):
        self.replies, self.sent = list(replies), []

    def __call__(self, messages, tools=None, model=None):
        self.sent.append({"messages": [dict(m) for m in messages], "tools": tools, "model": model})
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        msg = {"role": "assistant", "content": r} if isinstance(r, str) else {"role": "assistant", "content": None, "tool_calls": r}
        return {"message": msg, "finish_reason": "stop", "model": "fake"}


@pytest.fixture(autouse=True)
def one_model(monkeypatch):
    """Most tests use one model; test_spare_model_is_used_when_the_main_quota_is_out covers the spare."""
    monkeypatch.setattr(llm, "models", lambda: ("big", "big"))


@pytest.fixture
def farm(db_session):
    seed_demo_farm(db_session)
    return db_session


def turn(session, script, question, **page):
    req = ChatRequest(question=question, page=PageState(**page))
    return list(agent.run(session, "demo", req, complete=script, sleep=lambda s: None, today=date(2026, 11, 14)))


def kinds(events, t):
    return [e for e in events if e["type"] == t]


def test_a_month_in_the_past_opens_the_command_center_and_answers_from_its_facts(farm):
    script = Script([call("show_farm_health", date="2016-03-31", field="west")],
                    "In March 2016 rain ran below normal [3] and West Field's greenness is in [11]. 【4】")
    events = turn(farm, script, "show me what happened in march 2016")
    actions = [e["action"] for e in kinds(events, "action")]
    assert actions[:4] == [{"type": "navigate", "page": "command-center"}, {"type": "set_date", "date": "2016-03-31"},
                           {"type": "select_field", "field_id": "west", "field_name": "West Field"},
                           {"type": "highlight_fields", "field_ids": ["west"]}]
    facts = kinds(events, "facts")[0]
    assert facts["start"] == 1 and "replay" in facts["facts"][0]
    answer = kinds(events, "answer")[0]
    assert answer["cited_facts"] == [3, 4, 11] and answer["grounded"]   # 【4】 normalised to [4]
    assert "[4]" in answer["text"]
    assert kinds(events, "status")[0]["text"] == "Opening the Command Center at 31 Mar 2016"
    # The answer call sees the facts (and may still act, e.g. propose a change after reading them).
    assert script.sent[0]["tools"] and script.sent[1]["tools"]
    assert "[1] Farm: Demo Farm" in script.sent[1]["messages"][-1]["content"]


def test_simulation_changes_only_what_was_asked_and_keeps_the_rest(farm):
    current = {"field_id": "north", "rotations": [{"id": "A", "name": "Continuous maize", "crops": ["maize"], "cover_crop": False}],
               "scenario": {"temp_delta_c": 1.0, "rain_change_pct": 0, "irrigation": "none", "years": 5,
                            "projection": None, "heat_response": "local"}, "include_economics": False}
    script = Script([call("run_simulation", field="west", rain_change_pct=-20, irrigation="full")], "Done [5].")
    events = turn(farm, script, "west field, 20% less rain, full irrigation", page="simulator", simulation=current)
    req = next(e["action"]["request"] for e in kinds(events, "action") if e["action"]["type"] == "set_simulation")
    assert req["field_id"] == "west"
    assert req["scenario"]["temp_delta_c"] == 1.0 and req["scenario"]["rain_change_pct"] == -20
    assert req["scenario"]["irrigation"] == "full" and req["scenario"]["heat_response"] == "local"
    assert [r["name"] for r in req["rotations"]] == ["Continuous maize"] and req["include_economics"] is False
    assert [e["action"]["type"] for e in kinds(events, "action")][:3] == ["navigate", "set_simulation", "run_simulation"]


def test_bad_tool_input_goes_back_to_the_model_which_recovers(farm):
    script = Script([call("run_simulation", field="mars")], [call("run_simulation", temperature_change_c=99)],
                    "I couldn't run that.")
    events = turn(farm, script, "simulate mars")
    tool_results = [m["content"] for m in script.sent[2]["messages"] if m["role"] == "tool"]
    assert tool_results[0].startswith("Error: There is no field 'mars'")
    assert tool_results[1].startswith("Error: Those simulator settings aren't valid")
    assert kinds(events, "answer")[0]["text"] == "I couldn't run that." and not kinds(events, "facts")


def test_farm_changes_are_proposed_never_saved(farm):
    script = Script([call("propose_field_update", field="west", current_crop="soybean"),
                     call("propose_crop_history", field="west", season_year=2024, crop="maize", yield_value=11, yield_unit="t/ha")],
                    "Please check and confirm both changes.")
    events = turn(farm, script, "west is soybean now; it grew maize in 2024 at 11 t/ha")
    proposals = [e["action"] for e in kinds(events, "action") if e["action"]["type"] == "propose_change"]
    assert proposals[0]["change"] == {"kind": "update_field", "field_id": "west", "current_crop_id": "soybean"}
    assert proposals[0]["summary"] == ["Current crop: Oats → Soybean"]
    assert proposals[1]["change"]["kind"] == "add_crop_history" and proposals[1]["change"]["source"] == "Farmer-provided"
    assert proposals[1]["summary"] == ["2024: Maize, yield 11 t/ha (farmer-reported)"]
    # Nothing was written.
    from app.modules.croptwin import service
    west = service.get_field(farm, "demo", "west")
    assert west.current_crop_id == "oats" and west.crop_history == []
    # Proposals return no facts, so the model may keep calling tools.
    assert script.sent[1]["tools"] is not None


def test_a_yield_without_a_unit_is_refused(farm):
    script = Script([call("propose_crop_history", field="west", season_year=2024, crop="maize", yield_value=11)], "What unit?")
    events = turn(farm, script, "maize 2024, 11")
    assert not [e for e in kinds(events, "action") if e["action"]["type"] == "propose_change"]
    assert "unit" in [m for m in script.sent[1]["messages"] if m["role"] == "tool"][0]["content"]


def test_rate_limit_waits_then_retries(farm):
    script = Script(llm.RateLimited("busy", 3.0), "Hello, ask me about your farm.")
    events = turn(farm, script, "hi")
    assert kinds(events, "waiting") == [{"type": "waiting", "seconds": 3.0}]
    assert kinds(events, "answer")[0]["grounded"] is False   # cites nothing


def test_rate_limit_gives_up_after_a_minute(farm):
    script = Script(*[llm.RateLimited("busy", 30.0)] * 5)
    events = turn(farm, script, "hi")
    assert len(kinds(events, "waiting")) == 2 and kinds(events, "error")[0]["message"] == "busy"


def test_fields_named_in_the_answer_pulse_on_the_map(farm):
    events = turn(farm, Script("North Field and Creek Field look normal."), "how are my fields?")
    assert kinds(events, "action")[0]["action"] == {"type": "highlight_fields", "field_ids": ["north", "creek"]}


def test_earlier_facts_keep_their_numbers(farm):
    script = Script("As before [2].")
    req = ChatRequest(question="and?", facts=[f"fact {i}" for i in range(1, 51)])
    list(agent.run(farm, "demo", req, complete=script, sleep=lambda s: None))
    system = script.sent[0]["messages"][0]["content"]
    assert "[11] fact 11" in system and "[50] fact 50" in system and "[10] fact 10" not in system


def test_api_streams_ndjson(client, db_session, monkeypatch):
    seed_demo_farm(db_session)
    monkeypatch.setattr(llm, "complete", Script("Hello [1]."))
    r = client.post("/api/farms/demo/assistant/chat", json={"question": "hi", "facts": ["a fact"]})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/x-ndjson")
    events = [json.loads(line) for line in r.text.splitlines()]
    assert events[-1]["type"] == "answer" and events[-1]["cited_facts"] == [1]


def test_unknown_farm_is_an_error_event(client):
    events = [json.loads(line) for line in client.post("/api/farms/nope/assistant/chat", json={"question": "hi"}).text.splitlines()]
    assert events[0]["type"] == "error"


def test_spare_model_is_used_when_the_main_quota_is_out(farm, monkeypatch):
    monkeypatch.setattr(llm, "models", lambda: ("big", "small"))

    class Busy(Script):
        def __call__(self, messages, tools=None, model=None):
            if model == "big":
                self.sent.append({"model": model})
                raise llm.RateLimited("busy", 20.0)
            return super().__call__(messages, tools, model)

    script = Busy("Hello.")
    events = turn(farm, script, "hi")
    assert [s["model"] for s in script.sent] == ["big", "small"]
    assert not kinds(events, "waiting") and kinds(events, "answer")[0]["text"] == "Hello."


def test_a_garbled_tool_call_is_retried_once(farm):
    script = Script(llm.BadOutput("garbled"), "Fine now.")
    assert kinds(turn(farm, script, "hi"), "answer")[0]["text"] == "Fine now."
    script = Script(llm.BadOutput("garbled"), llm.BadOutput("garbled"))
    assert kinds(turn(farm, script, "hi"), "error")[0]["message"] == "garbled"


def test_quota_running_out_after_actions_still_reports_what_was_done(farm):
    script = Script([call("propose_field_update", field="west", current_crop="soybean")],
                    *[llm.RateLimited("busy", 30.0)] * 3)
    events = turn(farm, script, "west is soybean")
    assert kinds(events, "action") and not kinds(events, "error")
    answer = kinds(events, "answer")[0]
    assert answer["text"].startswith("Done: Preparing a change for you to confirm.") and "busy" in answer["text"]


def test_macedonian_turn_translates_steps_facts_and_cards(farm):
    import app.main  # noqa: F401  registers the catalogues
    script = Script([call("show_farm_health", date="2016-03-31"),
                     call("propose_field_update", field="west", current_crop="soybean")], "Одговор [3].")
    req = ChatRequest(question="март 2016", page=PageState())
    events = list(agent.run(farm, "demo", req, complete=script, sleep=lambda s: None, today=date(2026, 11, 14), lang="mk"))
    assert kinds(events, "status")[0]["text"] == "Се отвора Командниот центар на 31 мар 2016"
    facts = kinds(events, "facts")[0]["facts"]
    assert facts[0].startswith("Фарма: Demo Farm") and "ИЗМЕРЕНО Врнежи, 30 дена" in facts[2]
    card = next(e["action"] for e in kinds(events, "action") if e["action"]["type"] == "propose_change")
    assert card["title"] == "Промена на West Field" and card["summary"] == ["Тековна култура: Овес → Соја"]
    assert card["change"]["current_crop_id"] == "soybean"          # ids stay ids
    assert "Write every answer in Macedonian" in script.sent[0]["messages"][0]["content"]
