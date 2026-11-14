# Architecture

```
Frontend (React)  ──►  FastAPI
                         ├── modules/croptwin    farm profile (source of truth)
                         ├── modules/cropdoctor  observations → anomalies → explanations
                         ├── modules/simulator   rotations × scenarios → ranked outcomes
                         └── shared/
                              ├── connectors     NASA POWER, SMAP, MODIS, Landsat, GPM, SoilGrids
                              ├── db             PostgreSQL + PostGIS
                              └── advisor        LLM explanations grounded in module outputs
```

## Data flow

1. User creates a farm (CropTwin) → location, boundary, soil, crops, priorities stored.
2. CropDoctor pulls indicators via connectors, compares with baselines, emits anomalies + cautious explanations.
3. Simulator takes the farm + rotations + scenario, runs the engine per season, ranks by priorities.
4. Advisor receives CropDoctor / Simulator outputs and explains them; it never fabricates values.

## API surface (draft)

| Module | Prefix |
|---|---|
| CropTwin | `/api/farms` |
| CropDoctor | `/api/farms/{farm_id}/health` |
| Simulator | `/api/farms/{farm_id}/simulations` |
| Advisor | `/api/advisor` |
