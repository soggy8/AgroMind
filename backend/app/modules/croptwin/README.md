# CropTwin — digital farm representation

**Owns:** the farm profile. Source of truth for every other module.

- Location (optional map point) and field boundary (GeoJSON Polygon in a JSON column), area
- Current and previous crops
- Soil texture, pH, organic carbon (user-entered or from SoilGrids)
- Irrigation availability
- Farmer priorities and constraints (e.g. conserve water, maximise margin)

| File | Responsibility |
|---|---|
| `models.py` | DB tables (Farm, Field, CropHistory, Priorities) |
| `repository.py` | DB reads/writes |
| `schemas.py` | API request/response models |
| `service.py` | Public interface used by CropDoctor and Simulator |
| `router.py` | `/api/farms` endpoints |

Depends on: `shared` only.

## Status

Farm profile API and UI are built on `main` (merged from `croptwin/farm-profile`). See `docs/modules/croptwin.md`
and the merge guide `docs/modules/croptwin_handoff.md`.

- Tables and conventions: `docs/architecture.md`, "Database".
- `geometry.py` computes area and centroid from the GeoJSON boundary.
- `seed.py` loads the demo farm (`python -m app.modules.croptwin.seed`).
- `soil_source.py` is the SoilGrids adapter (committed sample for now); `service.prefill_soil_from_soilgrids`
  and `POST /api/farms/{farm_id}/fields/{field_id}/soil/prefill` use it.
- The Simulator reads farms and fields through `service.get_farm` / `service.get_field` (`simulator/ports.py`).
- Design notes, assumptions and open items: `docs/modules/croptwin.md`.
