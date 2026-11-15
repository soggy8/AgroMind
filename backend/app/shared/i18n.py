"""Translate the sentences the API writes into the language the browser asked for (Accept-Language).

Modules keep writing English. Each module has a catalogue (its `i18n_mk.py`) of exact phrases and templates
with `{name}` placeholders, registered in main.py; a middleware translates every JSON response from /api before it
leaves. Anything without a translation stays English, so a missing entry is never an error (tests/shared/
test_i18n.py checks the demo responses are covered).

How a string is translated, first match wins:
1. an exact phrase;
2. a template: each captured value is itself translated (so a rotation name or a sub-phrase inside a sentence is
   translated too); see _placeholder for what a placeholder may match;
3. several sentences or a "; "-separated list: each part separately;
4. a rotation name like "Maize → Soybean": each crop separately.

This module never imports a module (shared rule); main.py hands it the catalogues.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

SUPPORTED = ("en", "mk")
_PLACEHOLDER = re.compile(r"\{(\w+)\}")
# What a placeholder may match. Numbers: {day}, {year}, {num*}. Anything: {rest*}. Otherwise any text inside one
# sentence and one list item (no ";" and no sentence break), so a template never swallows several sentences.
_NUMBER = r"[+\-−]?\d+(?:[.,]\d+)?"
_PHRASE = r"(?:(?!;|(?<!\bal)[.!?]\s+[A-Z0-9\"(])[^\n])+?"


def _placeholder(name: str) -> str:
    if name in ("day", "year") or name.startswith("num"):
        return f"(?P<{name}>{_NUMBER})"
    if name.startswith("rest"):
        return f"(?P<{name}>.+?)"
    return f"(?P<{name}>{_PHRASE})"
# Keys whose values are identifiers or user data, never prose: left as they are.
SKIP_KEYS = frozenset({"id", "farm_id", "field_id", "rotation_id", "run_id", "crop_id", "current_crop_id", "projection",
                       "ssp", "kind", "status", "severity", "irrigation", "heat_response", "limiting_factor",
                       "soil_texture", "area_source", "boundary", "constraints", "crops", "family", "type",
                       "diff_unit", "dataset"})


# A sentence break: ., ! or ? then a capital, digit, quote or bracket; not after abbreviations in citations.
_SENTENCE = r"(?<!\bal)(?<!\bEq)(?<!\bch)(?<!\bSci)(?<!\bSoc)(?<!\bAm)(?<!\bJ)(?<!\bvs)(?<=[.!?])\s+(?=[A-Z0-9\"(])"


def _plain(v) -> bool:
    """A string or a list of strings: what an id field holds (objects under the same key are still translated)."""
    return isinstance(v, str) or (isinstance(v, list) and all(isinstance(x, str) for x in v))


def _join_like(s: str, sep: str, parts: list[str]) -> str:
    """Join translated parts with the separators the original used."""
    seps = re.findall(sep, s)
    out = parts[0]
    for joiner, part in zip(seps, parts[1:]):
        out += joiner + part
    return out


class Translator:
    def __init__(self, entries: dict[str, str]):
        self.exact: dict[str, str] = {}
        templates: list[tuple[re.Pattern, str, int]] = []
        for en, tr in entries.items():
            if _PLACEHOLDER.search(en):
                pattern, literal = "", 0
                for part in re.split(r"(\{\w+\})", en):
                    m = _PLACEHOLDER.fullmatch(part)
                    if m:
                        pattern += _placeholder(m.group(1))
                    else:
                        pattern += re.escape(part)
                        literal += len(part)
                templates.append((re.compile(pattern + r"\Z", re.S), tr, literal))
            else:
                self.exact[en] = tr
        # The most literal text first, so a specific template wins over a general one.
        self.templates = [(p, t) for p, t, _ in sorted(templates, key=lambda x: -x[2])]
        self._cache: dict[str, str] = {}

    def __call__(self, s: str, depth: int = 0) -> str:
        if not s or depth > 6 or not re.search(r"[A-Za-z]", s):
            return s
        if s in self._cache:
            return self._cache[s]
        out = self._translate(s, depth)
        if out != s and s[:1].isupper() and out[:1].islower():
            out = out[:1].upper() + out[1:]   # "Continuous oats does…" -> "Овес во монокултура е…"
        if len(self._cache) < 20000:
            self._cache[s] = out
        return out

    def _translate(self, s: str, depth: int) -> str:
        if s in self.exact:
            return self.exact[s]
        stripped = s.strip()
        if stripped != s and stripped in self.exact:
            return s.replace(stripped, self.exact[stripped])
        for pattern, tr in self.templates:
            m = pattern.match(s)
            if m:
                return _PLACEHOLDER.sub(lambda g: self(m.group(g.group(1)), depth + 1)
                                        if g.group(1) in m.groupdict() else g.group(0), tr)
        # Several sentences, or a list: translate the parts.
        for sep in (_SENTENCE, r";\s+"):
            if re.search(sep, s):
                return _join_like(s, sep, [self(p, depth + 1) for p in re.split(sep, s)])
        # One sentence ending in "." when the catalogue has it without (or a template without the full stop).
        if s.endswith(".") and not s.endswith(".."):
            inner = self(s[:-1], depth + 1)
            if inner != s[:-1]:
                return inner + "."
        if " → " in s:
            return " → ".join(self(p, depth + 1) for p in s.split(" → "))
        if re.search(r",\s+(?=[A-Z])", s):
            parts = re.split(r",\s+(?=[A-Z])", s)
            translated = [self(p, depth + 1) for p in parts]
            if translated != parts:
                return _join_like(s, r",\s+(?=[A-Z])", translated)
        return s

    def payload(self, obj, key: str | None = None):
        """Translate every string in a JSON value, skipping identifier and user-data keys."""
        if isinstance(obj, dict):
            return {k: (v if k in SKIP_KEYS and _plain(v) else self.payload(v, k)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self.payload(v, key) for v in obj]
        if isinstance(obj, str):
            return self(obj)
        return obj


_CATALOGS: dict[str, dict[str, str]] = {}


def register(lang: str, entries: dict[str, str]) -> None:
    """Add a module's catalogue for `lang` (main.py calls this at start-up)."""
    _CATALOGS.setdefault(lang, {}).update(entries)
    translator.cache_clear()


@lru_cache(maxsize=None)
def translator(lang: str) -> Translator | None:
    entries = _CATALOGS.get(lang)
    return Translator(entries) if entries else None


def language(accept_language: str | None) -> str:
    """The first supported language in an Accept-Language header; English otherwise."""
    for part in (accept_language or "").split(","):
        code = part.split(";")[0].strip().lower().split("-")[0]
        if code in SUPPORTED:
            return code
    return "en"


def translate(s: str, lang: str) -> str:
    t = translator(lang) if lang != "en" else None
    return t(s) if t else s


class TranslateResponses(BaseHTTPMiddleware):
    """Translate JSON responses from /api when the request asks for a language other than English."""

    async def dispatch(self, request: Request, call_next):
        lang = language(request.headers.get("accept-language"))
        response = await call_next(request)
        t = translator(lang) if lang != "en" else None
        if (t is None or not request.url.path.startswith("/api")
                or not response.headers.get("content-type", "").startswith("application/json")):
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])
        try:
            data = t.payload(json.loads(body))
        except ValueError:
            return Response(body, status_code=response.status_code, headers=dict(response.headers))
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        headers["content-language"] = lang
        return Response(json.dumps(data, ensure_ascii=False), status_code=response.status_code, headers=headers,
                        media_type="application/json")
