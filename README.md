# AgroMind

**NASA Space Apps Challenge — Field Shift: Adapting Farms with NASA Data**

> Understand your farm. Test its future. Make better decisions.

AgroMind is an agricultural digital twin with an interactive farm simulator. It helps farmers
understand current field conditions, investigate possible crop stress, and compare crop rotations
under changing climate scenarios, using NASA Earth observations, soil data, and farmer priorities.

## The modules

| Module | Question it answers | Backend | Frontend |
|---|---|---|---|
| **CropTwin** | *What is my farm?* Farm profile, field boundary, soil, crop history, priorities. | `backend/app/modules/croptwin` | `frontend/src/modules/croptwin` |
| **CropDoctor** | *What is happening on my farm now?* Indicators, anomalies vs. baseline, cautious stress explanations. | `backend/app/modules/cropdoctor` | `frontend/src/modules/cropdoctor` |
| **Simulator** | *What could happen next?* Rotations × climate scenarios over multiple seasons, ranked by priorities. | `backend/app/modules/simulator` | `frontend/src/modules/simulator` |
| **Economics** | *What does each option earn, and how bad do the bad years get?* The Simulator's weather years priced in dollars: climate bill, bad-year money, who earns most. | `backend/app/modules/economics` | `frontend/src/modules/economics` |

Cross-cutting pieces:

- **`shared/`** — database session, map UI, charts, optional NASA **connectors**, LLM **advisor** client (grounding).
- **`assistant/`** — farm-scoped chat that operates the app in natural language and cites module facts only.
  See [docs/modules/assistant.md](docs/modules/assistant.md).

### Dependency rules

```
            shared (connectors, db, advisor)
                 ▲        ▲        ▲
                 │        │        │
             CropTwin ◄───┴────────┤
                 ▲                 │
         ┌───────┴───────┐         │
     CropDoctor      Simulator ────┘
                         ▲
                     Economics (Simulator's service.py only)
              assistant (reads the modules via service.py)
```

- **CropTwin** depends only on `shared`. It is the source of truth for the farm.
- **CropDoctor** and **Simulator** read the farm through CropTwin's `service.py`, never its tables directly.
- CropDoctor and Simulator do **not** import each other.
- **Economics** reads the Simulator only through its `service.py` (in `economics/ports.py`). Nothing imports
  Economics except through its `service.py`.
- Modules talk to each other only through `service.py`; `router.py` is HTTP only.

## App pages (frontend)

| Hash route | Page |
|---|---|
| `#/` | Landing (globe, NASA data story, link into demo) |
| `#/overview` | Cross-module overview |
| `#/farm-profile` | CropTwin — draw fields, soil, priorities |
| `#/command-center` | CropDoctor — map, indicators, findings |
| `#/simulator` | Rotation and climate comparison |
| `#/economics` | Farm money: the climate bill, bad-year money, who earns most |

Use **Ask the advisor** or **Ctrl+K** on any dashboard page for the assistant.

## Repository layout

```
AgroMind/
├── backend/                 FastAPI (Python)
│   ├── app/
│   │   ├── main.py          mounts module routers
│   │   ├── core/            settings / config
│   │   ├── shared/          db, advisor client, connectors (stubs)
│   │   └── modules/
│   │       ├── croptwin/    farm profile (models, repository)
│   │       ├── cropdoctor/  indicators, baselines, anomalies, explanations
│   │       ├── simulator/   scenarios, rotations, engine, ranking
│   │       ├── economics/   Simulator results priced: climate bill, bad years, grid
│   │       └── assistant/   chat agent, tools, NDJSON stream
│   └── tests/               mirrors modules/
├── frontend/                React + TypeScript + Tailwind
│   └── src/
│       ├── app/             routing, landing, layout
│       ├── shared/          map, charts, assistant UI, api client
│       └── modules/         croptwin, cropdoctor, simulator, economics
├── data/                    samples (committed), raw/processed (git-ignored)
└── docs/                    architecture, data sources, module specs — see docs/README.md
```

## Labelling principle

Every value shown in the UI is one of: **observation** (measured), **model estimate**,
or **hypothetical scenario input**. The product must always make clear which.
Visual and copy rules: [DESIGN.md](DESIGN.md).

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

Frontend, from `frontend/`:

```bash
npm install && npm run dev    # http://localhost:5173 — proxies /api to port 8000
npm run build                 # type-check + production build
npm run e2e                   # Playwright (API + dev server must be running)
```

Copy `.env.example` to `.env` at the repo root. Optional `LLM_API_KEY` enables the assistant
(Groq free tier works; details in `.env.example`).

Supported versions: Python 3.11+ (developed on 3.14), Node `^20.19 || >=22.12` (Vite 8; developed on Node 25).
On Windows activate the venv with `.venv\Scripts\activate` instead of `source .venv/bin/activate`.
The database port is published on `127.0.0.1` only; `POSTGRES_PASSWORD` in `.env` overrides the dev default.

## Documentation

| Start here | |
|---|---|
| [docs/README.md](docs/README.md) | Index of architecture, modules, design |
| [docs/architecture.md](docs/architecture.md) | API prefixes, database, platform |
| [docs/data-sources.md](docs/data-sources.md) | NASA and supporting datasets |
| [docs/modules/croptwin_handoff.md](docs/modules/croptwin_handoff.md) | CropTwin feature map for merges |

## Status (2026-11-15)

- **Platform:** settings, database, Alembic migrations, `/api/health`. See [docs/architecture.md](docs/architecture.md).
- **CropTwin:** full farm profile UI and API (`#/farm-profile`). NASA map layers, SoilGrids prefill sample,
  weather card, locate and search. Handoff: [docs/modules/croptwin_handoff.md](docs/modules/croptwin_handoff.md).
- **CropDoctor:** Command Center on real sample data for the demo farm; cautious findings.
  [docs/modules/cropdoctor.md](docs/modules/cropdoctor.md).
- **Simulator:** end to end; reads farm, fields and soil from CropTwin; saved runs in the database;
  NASA CMIP6 scenarios, finder, irrigation planner. [docs/modules/simulator.md](docs/modules/simulator.md).
- **Economics:** API and the Farm money page (`#/economics`); prices each of the Simulator's 25 weather
  years with USDA and Iowa State numbers or the farmer's own. [docs/modules/economics.md](docs/modules/economics.md).
- **Assistant:** operates dashboards via chat; grounded on each module's `advisor.py`.
- **Languages:** English and Macedonian across the site, backend sentences and the assistant included (`docs/i18n.md`). New text: `t()` in the frontend, a template in the module's `i18n_mk.py` in the backend.
  [docs/modules/assistant.md](docs/modules/assistant.md).
- **Connectors:** shared `connectors/` package is mostly stubs; modules use `ports.py` and committed samples.

## Disclaimer

Built for the NASA Space Apps Challenge. Not an official NASA product and not endorsed by NASA.
Satellite and model outputs support decisions; they do not replace inspection on the ground.