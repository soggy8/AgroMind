# CropDoctor — crop monitoring and stress explanations

**Owns:** turning observations into anomalies and cautious explanations.

Every output separates four things:
1. **Observation** — the measured value (e.g. NDVI 0.41 on 2026-08-02)
2. **Anomaly** — deviation from a baseline (e.g. −18% vs. 2016–2025 mean)
3. **Possible explanation** — e.g. "water stress may be one explanation"
4. **Recommended check** — e.g. "inspect field and irrigation equipment"

Satellite indicators cannot diagnose disease, pests, or nutrient deficiency. Never present a guess as fact.

| File | Responsibility |
|---|---|
| `indicators/vegetation.py` | NDVI / EVI time series (MODIS, Landsat) |
| `indicators/soil_moisture.py` | SMAP surface soil moisture (coarse, not field-scale) |
| `indicators/weather.py` | Temperature, rainfall, ET (NASA POWER, GPM IMERG) |
| `baselines.py` | Historical reference periods per indicator |
| `anomalies.py` | Compare current values vs. baselines |
| `explanations.py` | Rule-based mapping from anomaly patterns → possible causes |
| `service.py` / `router.py` | `/api/farms/{id}/health` |

Depends on: `shared.connectors`, `croptwin.service`.
