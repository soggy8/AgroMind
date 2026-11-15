"""Everything the assistant reads from other modules, only through their service.py.

The assistant never writes: farm changes are proposed to the farmer, who applies them through CropTwin's API.
"""
from __future__ import annotations

from datetime import date
from typing import Any, get_args

from sqlalchemy.orm import Session

from app.modules.cropdoctor import service as cropdoctor
from app.modules.croptwin import service as croptwin
from app.modules.simulator import service as simulator

NotFound = croptwin.NotFound


class ToolFailed(Exception):
    """A tool couldn't do what was asked. The message goes back to the model (and may be shown)."""


def farm(session: Session, farm_id: str):
    return croptwin.get_farm(session, farm_id)


def farm_facts(session: Session, farm_id: str):
    return croptwin.advisor_context(croptwin.get_farm(session, farm_id))


def health_facts(session: Session, farm_id: str, as_of: date | None):
    try:
        health = cropdoctor.get_health(session, farm_id, as_of)
    except (cropdoctor.InvalidDate, cropdoctor.DataUnavailable, cropdoctor.NotFound) as e:
        raise ToolFailed(str(e)) from e
    return health, cropdoctor.advisor_context(health)


def simulator_options(session: Session, farm_id: str):
    return simulator.get_options(session, farm_id)


def simulate(session: Session, farm_id: str, request: dict[str, Any]):
    """Validate and run a SimulationRequest given as JSON. Returns (request as JSON, facts context)."""
    from pydantic import ValidationError
    try:
        req = simulator.SimulationRequest.model_validate(request)
        result = simulator.run_simulation(session, farm_id, req)
    except ValidationError as e:
        raise ToolFailed("Those simulator settings aren't valid: "
                         + "; ".join(f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors())) from e
    except (simulator.NotFound, simulator.InvalidRotation, simulator.WeatherUnavailable) as e:
        raise ToolFailed(str(e)) from e
    return req.model_dump(mode="json", by_alias=True), simulator.advisor_context(result)


def soil_textures() -> list[str]:
    """CropTwin's texture classes, read from its FieldUpdate contract so there is no fifth copy of the list."""
    ann = croptwin.FieldUpdate.model_fields["soil_texture"].annotation  # SoilTexture | None
    return [v for t in get_args(ann) for v in get_args(t)]
