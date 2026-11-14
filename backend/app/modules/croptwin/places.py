"""Place-name search for the farm profile map, through OpenStreetMap's Nominatim.

Follows the Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/), which the
project owner chose to accept on 2026-11-14:
  - only user-triggered searches (the UI searches on Enter, never as you type: autocomplete is forbidden)
  - at most 1 request per second for the whole app: `_wait_turn` spaces upstream calls from this server
  - the app identifies itself with its own User-Agent (stock library User-Agents are not allowed)
  - results are cached (`_cached`), so a repeated query never reaches Nominatim twice
  - attribution "© OpenStreetMap contributors" is shown with the results in the UI
  - the service can be switched without a client update: change NOMINATIM_SEARCH here (server side)
The only thing sent is the text the user typed. Tests replace `_fetch`, so they never touch the network.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict

import httpx

from .schemas import PlaceOut

# One constant so the service can be swapped server-side; move it to app settings when core/config.py allows.
NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "AgroMind/0.1 (NASA Space Apps farm digital twin; CropTwin place search)"
ATTRIBUTION = "© OpenStreetMap contributors (Nominatim)"
MIN_INTERVAL_S = 1.0
CACHE_SIZE = 256


class PlaceSearchUnavailable(RuntimeError):
    """The search service couldn't answer (network error, server error)."""


class PlaceSearchBusy(RuntimeError):
    """The search service asked us to slow down (HTTP 429)."""


_lock = threading.Lock()
_last_call = 0.0
_cache: OrderedDict[str, list[PlaceOut]] = OrderedDict()


def search(query: str, lang: str | None = None, limit: int = 5) -> list[PlaceOut]:
    """`lang` is the browser's language (e.g. "en-US"), so names come back in it (Nominatim accept-language)."""
    key = f"{lang or ''}|{' '.join(query.lower().split())}"
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    results = [_place(r) for r in _fetch(query.strip(), limit, lang)]
    with _lock:
        _cache[key] = results
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return results


def _wait_turn() -> None:
    """Keep upstream calls at least MIN_INTERVAL_S apart, across every user of this server."""
    global _last_call
    with _lock:
        delay = _last_call + MIN_INTERVAL_S - time.monotonic()
        _last_call = max(time.monotonic(), _last_call + MIN_INTERVAL_S)
    if delay > 0:
        time.sleep(delay)


def _fetch(query: str, limit: int, lang: str | None) -> list[dict]:
    _wait_turn()
    params = {"q": query, "format": "jsonv2", "limit": limit}
    if lang:
        params["accept-language"] = lang
    try:
        r = httpx.get(NOMINATIM_SEARCH, params=params,
                      headers={"User-Agent": USER_AGENT}, timeout=15)
    except httpx.HTTPError as e:
        raise PlaceSearchUnavailable(f"Couldn't reach the place search ({e.__class__.__name__}).") from e
    if r.status_code == 429:
        raise PlaceSearchBusy("The place search is busy. Wait a few seconds and try again.")
    if r.status_code >= 400:
        raise PlaceSearchUnavailable(f"The place search answered {r.status_code}.")
    return r.json()


def _place(r: dict) -> PlaceOut:
    bbox = None
    if len(r.get("boundingbox") or []) == 4:
        south, north, west, east = (float(x) for x in r["boundingbox"])  # Nominatim order: S, N, W, E
        bbox = (south, west, north, east)
    return PlaceOut(name=r.get("display_name", ""), lat=float(r["lat"]), lon=float(r["lon"]), bbox=bbox,
                    kind=r.get("addresstype") or r.get("type"))
