# AgroMind

NASA Space Apps project: a farm digital twin with a crop-rotation simulator. Three modules
(CropTwin, CropDoctor, Simulator) plus `shared/`. A team works on this repo, one module each.

## Read first

- `README.md`: module boundaries and dependency rules.
- `DESIGN.md`: the visual system and the honesty rules for any UI work.
- For Simulator work: `docs/modules/simulator.md` is the spec and status (what's left: section 8).

## Rules for every module

- Modules import each other only through `service.py`. CropDoctor and Simulator never import
  each other. `shared/` never imports a module.
- Every number shown to a user is Observed, Modelled or Scenario, with its source.
- Never invent measurements, yields or citations. A parameter without a source is marked
  as an assumption and listed where the user can see it.
- No raw hex colours in components; use the tokens in `DESIGN.md`.

## Working on the Simulator

- Stay inside `backend/app/modules/simulator/`, `backend/tests/simulator/`,
  `frontend/src/modules/simulator/` and `docs/modules/simulator*`. Other modules and `shared/`
  belong to teammates: if something there is missing, work behind `ports.py` or the sample
  data and tell the user what you need from whom. Building a missing shared UI component to
  the `DESIGN.md` spec is fine; say that you did.
- `schemas.py` and the frontend `types.ts` are one contract. Change both in the same commit.
- `engine/` stays pure: no FastAPI, pydantic, database or network imports.
- Don't change a value marked FAO in `parameters.py` without the table reference. Values marked
  ASSUME may be tuned during calibration; record what changed and why in the spec.
- The model is calibrated only for the demo grid cell and has weak year-to-year skill
  (`docs/modules/simulator_calibration.md`). Don't present t/ha or absolute yield as a
  prediction; lead with change versus today's climate. Rerun the calibration after changing
  anything in `engine/` or `parameters.py`.
- Field data, weather and saved runs go through `ports.py` and `store.py` only.
- Checks: `cd backend && pytest tests/simulator`; `cd frontend && npm run build`.

## Commits

No Claude attribution lines in commit messages or PR descriptions.
