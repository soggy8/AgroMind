# CropDoctor — crop monitoring and stress explanations

**Owns:** turning observations into anomalies and cautious explanations.
Spec and status: `docs/modules/cropdoctor.md`.

Every output separates four things:
1. **Observation** — the measured value (e.g. NDVI 0.76 for 27 Jul to 11 Aug 2012)
2. **Anomaly** — deviation from a baseline (e.g. −8% vs. the previous 10 years)
3. **Possible explanation** — e.g. "water stress may be one explanation"
4. **Recommended check** — e.g. "dig to 15 cm and feel whether the soil is dry"

Satellite indicators cannot diagnose disease, pests, or nutrient deficiency. Never present a guess as fact.

| File | Responsibility | State |
|---|---|---|
| `indicators/vegetation.py` | Field greenness series (MODIS NDVI) and the current period for a date | built, pure |
| `indicators/weather.py` | 30-day rain, mean daily high, reference ET0 (NASA POWER) | built, pure |
| `indicators/soil_moisture.py` | SMAP soil moisture | empty, needs an Earthdata login |
| `baselines.py` | Previous-10-years normal | built, pure |
| `anomalies.py` | Difference from normal, rank among earlier years, low periods, runs | built, pure |
| `explanations.py` | Rule-based findings: severity, explanations, checks | built, pure |
| `parameters.py` | Every threshold, marked ASSUME with its reason | built |
| `ports.py` | CropTwin, committed samples, POWER and Planetary Computer fetches | built |
| `fetch_samples.py` | CLI that writes the committed samples in `data/samples/` | built |
| `service.py` / `router.py` / `schemas.py` | `GET /api/farms/{id}/health?as_of=` | built |

Not built: the advisor fact list and `advisor-context` endpoint, the Landsat picture, greenness for
farms other than the demo farm.

Depends on: `croptwin.service`. It does not use `shared.connectors` yet; its own `ports.py` holds
the fetchers. It never imports the Simulator.
