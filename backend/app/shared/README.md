# shared — cross-cutting infrastructure

- `connectors/` — one file per external source. Each returns tidy, unit-labelled data with
  source, resolution, and date range attached. No business logic here.
- `db/` — PostgreSQL / PostGIS session and declarative base.
- `advisor/` — AI agricultural advisor. Receives **module outputs** (the facts each module's `advisor.py` builds)
  as context and explains them. `grounding.py` enforces that answers cite only provided data.

Shared code must never import from `modules/`.
