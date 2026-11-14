# Farm Simulator: rotations under climate scenarios

**Owns:** what-if experiments. A decision-support model, not a harvest prediction.

Inputs: a field + up to four rotations + a scenario (temperature, rainfall, irrigation, years,
prices). Outputs: yield relative to a typical year, change vs today's climate, water need and
irrigation, poor-season risk, a rotation soil index, optional economics, all with p10-p90 ranges
across 25 weather years, plus a ranked recommendation and every assumption with its source.

**Spec and status: `docs/modules/simulator.md`.** Calibration: `docs/modules/simulator_calibration.md`.

| File | Responsibility |
|---|---|
| `router.py` / `service.py` | `/api/farms/{id}/simulations`; orchestration (the only import for other modules) |
| `schemas.py` | API contract, mirrored by the frontend `types.ts` |
| `parameters.py` | Crop, soil and economic values, each with a source |
| `ports.py` | The only access to field data and weather (demo stand-ins for now) |
| `rotations.py`, `scenarios.py`, `ranking.py` | Schedule, scenario shifts, scoring and recommendation text |
| `engine/` | Pure model: ET0, soil water, crop factors, water balance, soil index, ensemble runner |
| `economics/` | Costs and revenue |
| `store.py` | Saved runs (JSON files until `shared/db` is used) |
| `advisor.py` | Facts for the AI advisor |
| `calibration.py` | `python -m app.modules.simulator.calibration --write` |

Rules: `engine/` is pure (no FastAPI, pydantic, database, network). Depends on CropTwin and
shared connectors through `ports.py` only. Must not import `cropdoctor`.
Tests: `pytest tests/simulator` from `backend/`.
