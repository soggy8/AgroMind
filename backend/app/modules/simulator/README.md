# Farm Simulator: rotations under climate scenarios

**Owns:** what-if experiments. A decision-support model, not a harvest prediction.

Inputs: a CropTwin field + rotation(s) + scenario (temperature, rainfall, irrigation, years).
Outputs: relative yield, water need, irrigation, stress risk, a rotation soil index, optional
economics, all with p10-p90 ranges, a ranked recommendation, and the list of assumptions.

**Full spec: `docs/modules/simulator.md`.** Read it before changing anything here.

| File | Responsibility | State |
|---|---|---|
| `schemas.py` | API contract (mirrored in the frontend `types.ts`) | written |
| `parameters.py` | Crop and soil parameters with sources; engine constants | written |
| `engine/types.py` | Data types crossing the engine boundary | written |
| `engine/et0.py` | Reference evapotranspiration | to create |
| `engine/water_balance.py` | Daily root-zone water balance | empty |
| `engine/crop_models.py` | Kc curve; water, heat and rotation yield factors | empty |
| `engine/soil_health.py` | Rotation soil index | empty |
| `engine/runner.py` | Ensemble loop over weather years; aggregation | to create |
| `scenarios.py` | Apply a scenario to weather; presets; climate summaries | empty |
| `rotations.py` | Validate rotations; schedule plantings; suggested rotations | empty |
| `ranking.py` | Indicator scores, ranking, recommendation text | empty |
| `ports.py` | The only access to `croptwin.service` and `shared.connectors` | to create |
| `models.py` | Saved runs table | to create |
| `economics/` | Optional costs and revenue | empty |
| `service.py` / `router.py` | Orchestration / `/api/farms/{id}/simulations` | empty |

Rules: `engine/` is pure (no FastAPI, pydantic, database, network). Depends on
`shared.connectors` and `croptwin.service` through `ports.py` only. Must not import `cropdoctor`.
