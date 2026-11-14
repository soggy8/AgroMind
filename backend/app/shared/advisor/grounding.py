"""Keeping the advisor's answers tied to the facts it was given."""
from __future__ import annotations

import re

_CITATION = re.compile(r"\[(\d{1,3})\]")


def facts_block(facts: list[str]) -> str:
    """Numbered facts, the only material the advisor may use."""
    return "Facts for this conversation:\n" + "\n".join(f"[{i}] {f}" for i, f in enumerate(facts, start=1))


def citations(answer: str, n_facts: int) -> tuple[list[int], list[int]]:
    """(valid cited fact numbers, cited numbers that don't exist), each sorted and unique."""
    cited = sorted({int(m) for m in _CITATION.findall(answer)})
    return [c for c in cited if 1 <= c <= n_facts], [c for c in cited if not 1 <= c <= n_facts]
