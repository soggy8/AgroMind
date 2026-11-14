# shared (UI)

- `map/` — Leaflet map + field drawing
- `charts/` — Recharts wrappers (time series, comparison bars, uncertainty bands)
- `api/` — base HTTP client
- `advisor/` — AI advisor chat panel, usable from any module
- `components/` — design-system primitives

Modules may import from `shared`; `shared` never imports from a module. Modules don't import each other.
