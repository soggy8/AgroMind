# AgroMind

**NASA Space Apps Challenge — Field Shift: Adapting Farms with NASA Data**

> Understand your farm. Test its future. Make better decisions.

AgroMind is an agricultural digital twin with an interactive farm simulator. It helps farmers
understand current field conditions, investigate possible crop stress, and compare crop rotations
under changing climate scenarios, using NASA Earth observations, soil data, and farmer priorities.

## The three modules

| Module | Question it answers | Backend | Frontend |
|---|---|---|---|
| **CropTwin** | *What is my farm?* Farm profile, field boundary, soil, crop history, priorities. | `backend/app/modules/croptwin` | `frontend/src/modules/croptwin` |
| **CropDoctor** | *What is happening on my farm now?* Indicators, anomalies vs. baseline, cautious stress explanations. | `backend/app/modules/cropdoctor` | `frontend/src/modules/cropdoctor` |
| **Simulator** | *What could happen next?* Rotations × climate scenarios over multiple seasons, ranked by priorities. | `backend/app/modules/simulator` | `frontend/src/modules/simulator` |

Cross-cutting pieces live in `shared/`: NASA and supporting **data connectors**, the **database**,
and the **AI advisor** (which only explains outputs produced by the modules; it never invents data).

### Dependency rules

```
            shared (connectors, db, advisor)
                 ▲        ▲        ▲
                 │        │        │
             CropTwin ◄───┴────────┤
                 ▲                 │
         ┌───────┴───────┐         │
     CropDoctor      Simulator ────┘
```

- **CropTwin** depends only on `shared`. It is the source of truth for the farm.
- **CropDoctor** and **Simulator** read the farm through CropTwin's `service.py`, never its tables directly.
- CropDoctor and Simulator do **not** import each other.
- Modules talk to each other only through `service.py`; `router.py` is HTTP only.

## Repository layout

```
AgroMind/
├── backend/                 FastAPI (Python)
│   ├── app/
│   │   ├── main.py          mounts the three module routers
│   │   ├── core/            settings / config
│   │   ├── shared/
│   │   │   ├── connectors/  NASA POWER, SMAP, MODIS, Landsat, GPM IMERG, SoilGrids
│   │   │   ├── db/          PostgreSQL / PostGIS session + base
│   │   │   └── advisor/     LLM client, prompts, grounding in module outputs
│   │   └── modules/
│   │       ├── croptwin/    farm profile (models, repository)
│   │       ├── cropdoctor/  indicators, baselines, anomalies, explanations
│   │       └── simulator/   scenarios, rotations, engine, economics, ranking
│   └── tests/               mirrors modules/
├── frontend/                React + TypeScript + Tailwind
│   └── src/
│       ├── app/             routing, layout, providers
│       ├── shared/          map, charts, api client, advisor chat, UI kit
│       └── modules/
│           ├── croptwin/    Farm Command Center: farm setup
│           ├── cropdoctor/  Farm Command Center: monitoring & alerts
│           └── simulator/   Farm Simulator: scenarios & comparison
├── data/                    samples (committed), raw/processed (git-ignored)
└── docs/                    architecture, data sources, per-module notes
```

## Labelling principle

Every value shown in the UI is one of: **observation** (measured), **model estimate**,
or **hypothetical scenario input**. The product must always make clear which.

## Running locally

Backend (Python 3.11+), from `backend/`:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head                        # create the tables (SQLite by default)
python -m app.modules.croptwin.seed         # demo farm: Story County, Iowa
uvicorn app.main:app --reload               # http://localhost:8000/docs
pytest
```

With no `.env` the API uses a SQLite file at `backend/var/agromind.db`. To use PostgreSQL,
run `docker compose up -d db` and set `DATABASE_URL` as in `.env.example`.

Frontend, from `frontend/`: `npm install && npm run dev` (proxies `/api` to port 8000).

Supported versions: Python 3.11+ (developed on 3.14), Node `^20.19 || >=22.12` (Vite 8; developed on Node 25).
On Windows activate the venv with `.venv\Scripts\activate` instead of `source .venv/bin/activate`.
The database port is published on `127.0.0.1` only; `POSTGRES_PASSWORD` in `.env` overrides the dev default.

## Status

- Platform: settings, database layer, migrations, health check. See `docs/architecture.md`.
- CropTwin: farm, field, soil and crop-history tables with a CRUD API at `/api/farms`.
- Simulator: working end to end; still reads the demo farm from `ports.py`, not CropTwin.
- CropDoctor, connectors, advisor: not started.
