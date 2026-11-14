"""Load the demo farm (Story County, Iowa) into the database. Safe to run twice.

    cd backend && python -m app.modules.croptwin.seed

The ids ("demo", "north", "creek", "west") are the ones the Simulator page (FARM_ID "demo") and the Simulator's
tests expect; the Simulator reads them through croptwin.service (simulator/ports.py).
Soil comes from the committed SoilGrids sample (via soil_source.py); no crop history or yields are seeded, because
we have none for these fields.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.shared.db import session_scope

from . import repository, service, soil_source
from .models import SoilLayer
from .schemas import FarmCreate, FieldCreate, GeoJSONPolygon

def _rect(lat0: float, lon0: float, lat1: float, lon1: float) -> GeoJSONPolygon:
    return GeoJSONPolygon(coordinates=[[(lon0, lat0), (lon1, lat0), (lon1, lat1), (lon0, lat1), (lon0, lat0)]])


DEMO_FIELDS = [
    ("north", "North Field", "maize", _rect(42.03673, -93.46250, 42.04167, -93.45384)),
    ("creek", "Creek Field", "soybean", _rect(42.03768, -93.45320, 42.04151, -93.44636)),
    ("west", "West Field", "oats", _rect(42.03720, -93.47104, 42.04151, -93.46310)),
]


def _soil_layers(lat: float, lon: float) -> list[SoilLayer]:
    profile = soil_source.soilgrids_profile(lat, lon)
    return [SoilLayer(**layer.model_dump(), retrieved_at=profile.retrieved_at) for layer in profile.layers]


def seed_demo_farm(session: Session) -> bool:
    """Returns False if the demo farm already exists."""
    if repository.get_farm(session, "demo") is not None:
        return False
    service.create_farm(session, FarmCreate(name="Demo Farm", region="Story County, Iowa"), farm_id="demo")
    for field_id, name, crop, boundary in DEMO_FIELDS:
        f = service.create_field(session, "demo", FieldCreate(name=name, boundary=boundary, current_crop_id=crop),
                                 field_id=field_id)
        repository.get_field(session, "demo", field_id).soil_layers = _soil_layers(f.centroid_lat, f.centroid_lon)
    session.commit()
    return True


if __name__ == "__main__":
    with session_scope() as s:
        print("Seeded the demo farm." if seed_demo_farm(s) else "Demo farm already exists; nothing to do.")
