# Architecture

```
Frontend (React)  ──►  FastAPI
                         ├── modules/croptwin    farm profile (source of truth)
                         ├── modules/cropdoctor  observations → anomalies → explanations
                         ├── modules/simulator   rotations × scenarios → ranked outcomes
                         ├── modules/assistant   NL chat; drives UI + cites module facts
                         └── shared/
                              ├── connectors     NASA POWER, SMAP, MODIS, Landsat, GPM, SoilGrids (planned)
                              ├── db             PostgreSQL + PostGIS (SQLite in dev)
                              └── advisor/       LLM client, grounding (assistant + advisor routes)
```

## Data flow

1. User creates a farm (CropTwin) → location, field boundaries, soil, crop history, priorities stored.
2. CropDoctor reads the farm via CropTwin, loads committed NASA samples (and live POWER for “today”),
   compares indicators with baselines, emits cautious findings.
3. Simulator reads the same farm through CropTwin, takes rotations + scenario, runs the engine, ranks by priorities.
4. The **assistant** calls module `service.py` and each module's `advisor.py` fact builders. It may navigate the UI
   and propose farm edits; answers cite numbered facts only. Standalone **advisor** routes remain for module-local
   “explain this payload” calls.

## API surface

| Module | Prefix |
|---|---|
| CropTwin | `/api/farms` |
| CropDoctor | `/api/farms/{farm_id}/health` (and related field endpoints) |
| Simulator | `/api/farms/{farm_id}/simulations` |
| Assistant | `/api/farms/{farm_id}/assistant/chat` (NDJSON stream) |
| Advisor | `/api/advisor` (grounded explain; module-specific handlers) |

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

Not in the database:

- CropDoctor indicators and baselines: computed from committed sample files in `data/samples/` on each request;
  no observation tables yet.
- Weather and imagery caches: optional files under `data/cache/` when live connectors are added.

In the database:

- Simulator **saved runs** (`simulation_runs` table): request + result JSON, scoped per farm. Accessed via
  `simulator/store.py` and the same service functions whether the backend uses SQLite or PostgreSQL.
