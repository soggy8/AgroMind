"""Response translation (app/shared/i18n.py) and the Macedonian catalogues' coverage of the demo farm."""
import re

import pytest

from app.modules.croptwin.seed import seed_demo_farm
from app.shared.i18n import Translator, language, translator

MK = {"Possible water stress": "Можен недостиг на вода", "Maize": "Пченка", "Soybean": "Соја",
      "{name} fits your priorities best in this scenario": "{name} најдобро одговара на вашите приоритети во ова сценарио",
      "Highest yield, {n}% of typical": "Најголем принос, {n}% од вообичаеното",
      "{reason}, against {v} for {name}": "{reason}, наспроти {v} за {name}",
      "{day} Aug {year}": "{day} авг {year}", "Water stress may be one explanation.": "Можно објаснување е недостиг на вода.",
      "Continuous {crop}": "{crop} во монокултура", "oats": "овес"}


def test_exact_templates_recursion_arrows_sentences_and_lists():
    t = Translator(MK)
    assert t("Possible water stress") == "Можен недостиг на вода"
    assert t("Maize → Soybean fits your priorities best in this scenario") == "Пченка → Соја најдобро одговара на вашите приоритети во ова сценарио"
    assert t("Highest yield, 81% of typical, against 78% for Maize → Soybean") == "Најголем принос, 81% од вообичаеното, наспроти 78% за Пченка → Соја"
    assert t("12 Aug 2012") == "12 авг 2012" and t("Somewhere Aug else") == "Somewhere Aug else"   # numbers only
    assert t("Possible water stress; Water stress may be one explanation.") == "Можен недостиг на вода; Можно објаснување е недостиг на вода."
    assert t("Possible water stress.") == "Можен недостиг на вода."
    assert t("Continuous oats") == "Овес во монокултура"   # capital kept
    assert t("Unknown words stay") == "Unknown words stay" and t("42") == "42"


def test_payload_skips_ids_and_user_data():
    t = Translator(MK)
    out = t.payload({"id": "Maize", "crops": ["Maize"], "name": "Maize", "nested": [{"headline": "Possible water stress"}]})
    assert out == {"id": "Maize", "crops": ["Maize"], "name": "Пченка", "nested": [{"headline": "Можен недостиг на вода"}]}


def test_accept_language():
    assert language("mk-MK,mk;q=0.9,en;q=0.8") == "mk" and language("de,en;q=0.5") == "en" and language(None) == "en"


ENGLISH = re.compile(r"\b(the|and|of|is|are|with|your|against|from|this|than|not|only)\b", re.I)


def _prose(obj, key=None, out=None):
    """Sentences a farmer reads (citations and sources excluded: they stay as published)."""
    out = [] if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            if "source" not in k and k not in ("id", "name", "region", "farm", "unit"):
                _prose(v, k, out)
    elif isinstance(obj, list):
        for v in obj:
            _prose(v, key, out)
    elif isinstance(obj, str) and len(obj.split()) > 2:
        out.append(re.sub(r"\([^()]*\)", "", obj))
    return out


@pytest.mark.parametrize("call", ["health", "run", "find", "irrigation"])
def test_demo_responses_read_in_macedonian(client, db_session, call):
    seed_demo_farm(db_session)
    h = {"Accept-Language": "mk"}
    B = "/api/farms/demo"
    opts = client.get(f"{B}/simulations/options").json()
    if call == "health":
        r = client.get(f"{B}/health", headers=h)
    elif call == "run":
        r = client.post(f"{B}/simulations/run", headers=h, json={"field_id": "west", "rotations": opts["suggested_rotations"],
                        "scenario": {"temp_delta_c": 2, "rain_change_pct": -20, "irrigation": "limited", "irrigation_cap_mm": 100},
                        "include_economics": True})
    elif call == "find":
        r = client.post(f"{B}/simulations/find", headers=h, json={"field_id": "west", "scenario": {}, "include_economics": True})
    else:
        r = client.post(f"{B}/simulations/irrigation-plan", headers=h,
                        json={"field_id": "west", "rotation": opts["suggested_rotations"][1], "scenario": {"temp_delta_c": 3}})
    assert r.status_code == 200 and r.headers["content-language"] == "mk"
    english = [s for s in _prose(r.json()) if ENGLISH.search(s)]
    assert not english, english[:5]


def test_ids_survive_translation(client, db_session):
    seed_demo_farm(db_session)
    opts = client.get("/api/farms/demo/simulations/options", headers={"Accept-Language": "mk"}).json()
    assert [c["id"] for c in opts["crops"]][:2] == ["maize", "soybean"]
    assert opts["suggested_rotations"][1]["crops"] == ["maize", "soybean"]
    assert opts["crops"][0]["name"] == "Пченка"


def test_english_is_untouched(client, db_session):
    seed_demo_farm(db_session)
    r = client.get("/api/farms/demo/health")
    assert "content-language" not in r.headers and r.json()["findings"][0]["headline"] == "Possible water stress"


def test_catalogue_is_registered():
    assert translator("mk") is not None and translator("de") is None
