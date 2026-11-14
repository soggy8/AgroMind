# CropTwin — digital farm representation

**Owns:** the farm profile. Source of truth for every other module.

- Location and field boundary (PostGIS geometry), area
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
