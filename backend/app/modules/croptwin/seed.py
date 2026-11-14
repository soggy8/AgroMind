"""Load the demo farm (Story County, Iowa) into the database. Safe to run twice.

    cd backend && python -m app.modules.croptwin.seed

Field boundaries and current crops match the stand-in DEMO_FARM in simulator/ports.py, so the
ids ("demo", "north", "creek", "west") line up when ports.py switches to croptwin.service.
Soil comes from the committed SoilGrids sample; no crop history or yields are seeded, because
we have none for these fields.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT
from app.shared.db import session_scope

from . import repository, service
from .models import SoilLayer
from .schemas import FarmCreate, FieldCreate, GeoJSONPolygon

SOIL_SAMPLE = REPO_ROOT / "data" / "samples" / "soilgrids_story_county_ia.json"
SOIL_QUERIED = datetime(2026, 11, 14, tzinfo=timezone.utc)  # date in the sample's _source note


def _rect(lat0: float, lon0: float, lat1: float, lon1: float) -> GeoJSONPolygon:
    return GeoJSONPolygon(coordinates=[[(lon0, lat0), (lon1, lat0), (lon1, lat1), (lon0, lat1), (lon0, lat0)]])


DEMO_FIELDS = [
    ("north", "North Field", "maize", _rect(42.03673, -93.46250, 42.04167, -93.45384)),
    ("creek", "Creek Field", "soybean", _rect(42.03768, -93.45320, 42.04151, -93.44636)),
    ("west", "West Field", "oats", _rect(42.03720, -93.47104, 42.04151, -93.46310)),
]


def _soil_layers() -> list[SoilLayer]:
    data = json.loads(SOIL_SAMPLE.read_text())
    source = (f"ISRIC SoilGrids v2.0, 250 m grid cell at {data['lat']} N, {abs(data['lon'])} W "
              "(one sample shared by all demo fields)")
    layers = []
    for layer in data["layers"]:
        top, bottom = (int(x) for x in layer["depth"].removesuffix("cm").split("-"))
        layers.append(SoilLayer(depth_top_cm=top, depth_bottom_cm=bottom, sand_pct=layer["sand_pct"],
                                silt_pct=layer["silt_pct"], clay_pct=layer["clay_pct"], soc_g_kg=layer["soc_g_kg"],
                                ph=layer["ph"], source=source, retrieved_at=SOIL_QUERIED))
    return layers


def seed_demo_farm(session: Session) -> bool:
    """Returns False if the demo farm already exists."""
    if repository.get_farm(session, "demo") is not None:
        return False
    service.create_farm(session, FarmCreate(name="Demo Farm", region="Story County, Iowa"), farm_id="demo")
    for field_id, name, crop, boundary in DEMO_FIELDS:
        service.create_field(session, "demo", FieldCreate(name=name, boundary=boundary, current_crop_id=crop),
                             field_id=field_id)
        repository.get_field(session, "demo", field_id).soil_layers = _soil_layers()
    session.commit()
    return True


if __name__ == "__main__":
    with session_scope() as s:
        print("Seeded the demo farm." if seed_demo_farm(s) else "Demo farm already exists; nothing to do.")
