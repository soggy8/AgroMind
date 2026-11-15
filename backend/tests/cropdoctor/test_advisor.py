"""CropDoctor's fact list for the AI advisor."""
import re

BASE = "/api/farms/demo/health"


def test_facts_carry_the_finding_its_check_and_the_caveat(api):
    health = api.get(BASE).json()
    ctx = api.post(f"{BASE}/advisor-context", json=health).json()
    facts = "\n".join(ctx["facts"])
    assert "Finding for West Field (watch)" in facts and "Possible water stress" in facts
    assert "Dig to 15 cm" in facts and "Satellites can't rule out pests or disease." in facts
    assert "OBSERVED Rainfall, 30 days" in facts and "MODELLED Water demand" in facts
    assert "replay" in ctx["facts"][0]
    assert ctx["suggested_questions"][0] == "Why is West Field flagged?"
    # The instructions keep findings cautious.
    assert "never 'detected'" in ctx["instructions"]
    assert not re.search(r"\b(detected|confirmed|caused by)\b", facts, re.I)


def test_other_farms_health_is_refused(api):
    health = api.get(BASE).json()
    assert api.post("/api/farms/other/health/advisor-context", json=health).status_code == 422
