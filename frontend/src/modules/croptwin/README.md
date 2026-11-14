# CropTwin (UI)

Farm profile page (`#/farm-profile`): fields drawn on the map, field details, soil layers, crop history,
priorities and constraints.

- `pages/FarmProfilePage.tsx`: the shell (top bar + floating panels over `shared/map/FarmMap`).
- `components/`: module-private panels (farm, field, soil table, crop history).
- `state/useFarmProfile.ts`: saved farm, unsaved drafts, and actions. "Save farm" sends the drafts.
- `api/croptwinApi.ts`: calls `/api/farms`. `types.ts` mirrors `backend/app/modules/croptwin/schemas.py`.
- Boundary drawing is the shared `shared/map/BoundaryDraw.tsx`.

Notes and assumptions: `docs/modules/croptwin.md`.
