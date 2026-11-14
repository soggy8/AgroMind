"""Where CropTwin gets mapped soil from: ISRIC SoilGrids, for now through the committed sample.

`soilgrids_profile(lat, lon)` is the one function to swap for `app.shared.connectors.soilgrids`
when that connector exists. Until then it reads data/samples/soilgrids_story_county_ia.json and
serves it only for fields near the point it was queried at, so a field elsewhere never gets
Iowa soil. SoilGrids values are mapped estimates on a ~250 m grid, not measurements of the field.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import REPO_ROOT

from .schemas import SoilLayerIn

SAMPLE = REPO_ROOT / "data" / "samples" / "soilgrids_story_county_ia.json"
# ASSUMPTION (unsourced): fields within 5 km of the sample point share its soil closely enough for a demo.
# The three demo fields sit 0.5-1.5 km from it.
SAMPLE_RADIUS_KM = 5.0


class SoilDataUnavailable(LookupError):
    """No SoilGrids data for this location (live connector not built yet)."""


@dataclass(frozen=True)
class SoilGridsProfile:
    layers: list[SoilLayerIn]  # each layer's `source` is the citation
    retrieved_at: datetime | None  # when SoilGrids was queried, if the source says
    lat: float
    lon: float


def soilgrids_profile(lat: float, lon: float, sample: Path = SAMPLE) -> SoilGridsProfile:
    """SoilGrids layers for a point, from the committed sample (no live connector yet). Raises SoilDataUnavailable beyond SAMPLE_RADIUS_KM of the sample point."""
    data = json.loads(sample.read_text(encoding="utf-8"))
    distance = _km(lat, lon, data["lat"], data["lon"])
    if distance > SAMPLE_RADIUS_KM:
        raise SoilDataUnavailable(
            f"Live SoilGrids isn't connected yet, and the saved sample only covers fields within "
            f"{SAMPLE_RADIUS_KM:g} km of {data['lat']} N, {abs(data['lon'])} W (Story County, Iowa); this field is "
            f"{distance:.0f} km away. Enter soil values from a lab report instead.")
    source = data["_source"]
    layers = []
    for layer in data["layers"]:
        top, bottom = (int(x) for x in layer["depth"].removesuffix("cm").split("-"))
        layers.append(SoilLayerIn(depth_top_cm=top, depth_bottom_cm=bottom, sand_pct=layer.get("sand_pct"),
                                  silt_pct=layer.get("silt_pct"), clay_pct=layer.get("clay_pct"),
                                  soc_g_kg=layer.get("soc_g_kg"), ph=layer.get("ph"), source=source))
    return SoilGridsProfile(layers=layers, retrieved_at=_queried(source), lat=data["lat"], lon=data["lon"])


def _queried(source: str) -> datetime | None:
    m = re.search(r"queried (\d{4}-\d{2}-\d{2})", source)
    return datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc) if m else None


def _km(lat0: float, lon0: float, lat1: float, lon1: float) -> float:
    """Haversine distance on a 6371 km sphere."""
    p0, p1 = math.radians(lat0), math.radians(lat1)
    a = (math.sin((p1 - p0) / 2) ** 2
         + math.cos(p0) * math.cos(p1) * math.sin(math.radians(lon1 - lon0) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(a))
