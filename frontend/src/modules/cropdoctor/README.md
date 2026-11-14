# CropDoctor (UI)

Farm Command Center — monitoring: greenness against normal, weather, and stress findings with
observation / anomaly / possible-explanation / recommended-check clearly separated.
Spec and status: `docs/modules/cropdoctor.md`.

- `pages/CommandCenterPage.tsx`: map, field list, indicator rows, 8-day strip, season chart and
  finding block. Floating panels at 1024 px and wider; below that the map with Fields and Status tabs.
- `components/`: module components, including `AdvisorDrawer.tsx`, which for now only says
  "Work in progress".
- `api/` calls `GET /api/farms/{id}/health`. `types.ts` mirrors the backend `schemas.py`; change both together.
- The shared pieces it uses (`Badge`, `FieldRow`, `IndicatorRow`, `SeasonChart`, `WeeklyStrip`, `NdviKey`)
  live in `src/shared/`.
- Opens on the 12 Aug 2012 replay, labelled with its date. "Today" shows saved data and tries a refresh.
- Shows the demo farm unless the address names another: `/?farm=<id>#/command-center`. The top
  bar's farm switcher is still a shared placeholder; when it exists it should set this.
- Smoke tests: `frontend/e2e/command-center.spec.ts`, `command-center-advisor.spec.ts` and
  `command-center-farm.spec.ts`.
