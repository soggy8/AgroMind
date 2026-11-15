"""Keeping the advisor's answers tied to the facts it was given."""
from __future__ import annotations

import re

_CITATION = re.compile(r"\[(\d{1,3})\]")
# Some models (gpt-oss) cite as 【5】 or 【5†source】; rewrite those as [5].
_ODD_CITATION = re.compile(r"【\s*(\d{1,3})(?:†[^】]*)?\s*】")


_GROUP = re.compile(r"\[(\d{1,3}(?:\s*(?:[-‑–—]|,)\s*\d{1,3})+)\]")


def _expand(m: re.Match) -> str:
    """[2, 5] -> [2][5]; [27-30] -> [27][28][29][30] (ranges of up to 10)."""
    out: list[int] = []
    for part in m.group(1).split(","):
        bounds = [int(x) for x in re.split(r"[-‑–—]", part) if x.strip()]
        lo, hi = bounds[0], bounds[-1]
        out += list(range(lo, hi + 1)) if 0 <= hi - lo < 10 else [lo, hi]
    return "".join(f"[{n}]" for n in out)


def normalize_citations(answer: str) -> str:
    """Rewrite the citation styles models use (【5】, [2, 5], [27-30]) as [n] each."""
    return _GROUP.sub(_expand, _ODD_CITATION.sub(r"[\1]", answer))


def facts_block(facts: list[str]) -> str:
    """Numbered facts, the only material the advisor may use."""
    return "Facts for this conversation:\n" + "\n".join(f"[{i}] {f}" for i, f in enumerate(facts, start=1))


def citations(answer: str, n_facts: int) -> tuple[list[int], list[int]]:
    """(valid cited fact numbers, cited numbers that don't exist), each sorted and unique."""
    cited = sorted({int(m) for m in _CITATION.findall(answer)})
    return [c for c in cited if 1 <= c <= n_facts], [c for c in cited if not 1 <= c <= n_facts]
