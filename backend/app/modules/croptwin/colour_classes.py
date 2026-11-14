"""Turn a NASA GIBS map pixel back into NASA's own value class.

GIBS draws each layer from a colour map (https://gibs.earthdata.nasa.gov/colormaps/v1.3/<name>.xml) in which every
class has one exact RGB colour and a value range such as "[0.105,0.107)", "[-INF,0.1)" or "[53.0884,+INF)". The
browser reads the pixel at a field's centroid; this module looks the colour up in that colour map. It never
interpolates: the answer is the class range NASA published, or "no data" / "not in the key".

Colour maps are fetched once per name and cached. Only names made of letters, digits and underscores are accepted,
and the base URL is fixed, so this can't be pointed at another server. Tests use saved colour maps.
"""
from __future__ import annotations

import re
import threading
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import httpx

COLORMAPS = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/"
NAME = re.compile(r"^[A-Za-z0-9_]{3,100}$")


class ColourMapUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class Entry:
    rgb: tuple[int, int, int]
    value: str | None  # NASA's range text, e.g. "[0.105,0.107)"
    transparent: bool
    nodata: bool
    title: str  # the ColorMap it belongs to, e.g. "Rain Rate", "Snow Rate", "No Data"
    units: str | None
    label: str | None  # legend tooltip when the colour map gives one, e.g. "Insignificant"


@dataclass(frozen=True)
class Reading:
    status: str  # "class" | "nodata" | "transparent" | "unknown"
    low: float | None = None
    high: float | None = None
    range_text: str | None = None
    units: str | None = None
    title: str | None = None
    label: str | None = None


def parse(xml: str) -> list[Entry]:
    """Every ColorMapEntry in a GIBS colour map XML, with its ColorMap's title and units and any legend tooltip."""
    root = ET.fromstring(xml)
    entries: list[Entry] = []
    for cmap in root.iter("ColorMap"):
        tooltips = {}
        for le in cmap.iter("LegendEntry"):
            if le.get("rgb") and le.get("tooltip"):
                tooltips[le.get("rgb")] = le.get("tooltip")
        for e in cmap.iter("ColorMapEntry"):
            rgb = tuple(int(x) for x in e.get("rgb", "0,0,0").split(","))
            entries.append(Entry(rgb=rgb, value=e.get("value"), transparent=e.get("transparent") == "true",
                                 nodata=e.get("nodata") == "true", title=cmap.get("title", ""), units=cmap.get("units"),
                                 label=tooltips.get(e.get("rgb", ""))))
    return entries


def _bounds(value: str | None) -> tuple[float | None, float | None]:
    """"[0.105,0.107)" → (0.105, 0.107); "[-INF,0.1)" → (None, 0.1); "[53.08,+INF)" → (53.08, None); "[5]" → (5, 5)."""
    if not value:
        return None, None
    parts = value.strip("[]()").split(",")
    num = lambda s: None if s.strip().upper() in ("-INF", "+INF", "INF") else float(s)
    return (num(parts[0]), num(parts[0])) if len(parts) == 1 else (num(parts[0]), num(parts[1]))


def classify(entries: list[Entry], rgb: tuple[int, int, int], alpha: int) -> Reading:
    """Exact colour match only. A transparent pixel is no data (or, where the map says so, below a threshold)."""
    if alpha == 0:
        hidden = sorted({e.label or ("No data" if e.nodata else e.value or "") for e in entries if e.transparent} - {""})
        return Reading("transparent", label=", ".join(hidden) or "No data")
    for e in entries:
        if e.rgb == rgb and not e.transparent:
            if e.nodata:
                return Reading("nodata", title=e.title)
            low, high = _bounds(e.value)
            return Reading("class", low=low, high=high, range_text=e.value, units=e.units, title=e.title, label=e.label)
    return Reading("unknown")


_cache: dict[str, list[Entry]] = {}
_lock = threading.Lock()


def colour_map(name: str) -> list[Entry]:
    """The GIBS colour map `name`, fetched once per process and cached. Raises ValueError for a bad name and ColourMapUnavailable when GIBS can't supply it."""
    if not NAME.match(name):
        raise ValueError("Unknown colour map name.")
    with _lock:
        if name in _cache:
            return _cache[name]
    entries = parse(_fetch(name))
    with _lock:
        _cache[name] = entries
    return entries


def _fetch(name: str) -> str:
    try:
        r = httpx.get(f"{COLORMAPS}{name}.xml", timeout=20)
    except httpx.HTTPError as e:
        raise ColourMapUnavailable(f"Couldn't reach NASA GIBS for the colour key ({e.__class__.__name__}).") from e
    if r.status_code == 404:
        raise ValueError("Unknown colour map name.")
    if r.status_code >= 400:
        raise ColourMapUnavailable(f"NASA GIBS answered {r.status_code} for the colour key.")
    return r.text
