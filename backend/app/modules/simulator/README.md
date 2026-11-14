# Farm Simulator — rotations under climate scenarios

**Owns:** what-if experiments. A decision-support model, not a harvest prediction.

Inputs: a CropTwin farm + rotation(s) + scenario (ΔT, Δrainfall, irrigation, seasons).
Outputs: relative yield, water requirement, soil-health indicators, stress/failure risk,
optional costs and revenue — all with uncertainty ranges and documented assumptions.

| File | Responsibility |
|---|---|
| `scenarios.py` | Scenario definition; applies perturbations to a climate baseline |
| `rotations.py` | Crop sequences, crop calendars, suitability checks |
| `engine/crop_models.py` | Transparent crop-specific response rules (heat, water) |
| `engine/water_balance.py` | Seasonal water demand vs. supply |
| `engine/soil_health.py` | Rotation effects on soil (e.g. legumes, organic carbon) |
| `economics/costs.py` | Optional: inputs, irrigation, production cost |
| `economics/revenue.py` | Optional: revenue, margin, price sensitivity |
| `ranking.py` | Score rotations against farmer priorities |
| `service.py` / `router.py` | `/api/farms/{id}/simulations` |

Depends on: `shared.connectors`, `croptwin.service`. Must not import `cropdoctor`.
