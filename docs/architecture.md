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

## Backend platform

| Piece | Where | Notes |
|---|---|---|
| Settings | `app/core/config.py` | `get_settings()`; reads env and repo-root `.env`. Modules never read `os.environ`. |
| DB base | `app/shared/db/base.py` | `Base`, naming convention, `IdMixin` (string ids), `TimestampMixin`, `JSONType` |
| Sessions | `app/shared/db/session.py` | `get_session` (FastAPI dependency), `session_scope()` (scripts) |
| Model registry | `app/models.py` | Imports each module's `models.py` so Alembic sees every table |
| Migrations | `backend/migrations/` | Alembic. `alembic revision --autogenerate -m "..."`, then review the file. |
| App | `app/main.py` | `create_app()`: CORS, routers, `/api/health` (reports database status) |

## Database

PostgreSQL in deployment and `docker-compose.yml`; SQLite with no setup in dev and tests. The
schema uses only portable types so the same migrations run on both.

Each module owns its tables and is the only code that queries them. Other modules go through
its `service.py`, which returns pydantic schemas, not ORM rows.

```
farms                         CropTwin
  id, name, region, priorities (JSON weights), constraints
  └─ fields
       id, farm_id, name, boundary (GeoJSON), centroid_lat/lon, area_ha, area_source,
       irrigation_available, current_crop_id, soil_texture
       ├─ soil_layers         depth_top/bottom_cm, sand/silt/clay %, soc g/kg, pH, source, retrieved_at
       └─ crop_history        season_year, crop_id, yield_value/unit (farmer-reported only), source
```

Conventions:

- **Provenance lives next to the value.** Soil layers and crop history have a required `source`;
  `fields.area_source` says whether area was computed from the boundary or stated by the farmer.
  This is what lets the UI label every number Observed, Modelled or Scenario.
- **Ids are strings.** Generated ids are 32-char hex; seeded rows use readable ids (`demo`,
  `north`) that match the simulator's stand-in data.
- **Boundaries are GeoJSON, not PostGIS geometry, for now.** The MVP has one region and a few
  fields, and no spatial query yet, so a geometry column would only cost SQLite compatibility.
  The compose image has PostGIS installed: when a spatial query is needed, add a
  `geometry(Polygon, 4326)` column in a migration and backfill it from `boundary`.
- **Alembic manages only our tables.** `migrations/env.py` ignores the PostGIS image's own
  tables (TIGER geocoder, topology), which autogenerate would otherwise try to drop.

Not in the database yet:

- Simulator saved runs: JSON files via `simulator/store.py` (swap planned behind the same four functions).
- Weather: NASA POWER responses cached as files under `data/cache/`.
- CropDoctor observations and baselines: no tables until that module starts.
