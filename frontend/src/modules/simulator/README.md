# Simulator (UI)

Farm Simulator: pick rotations, set the scenario (temperature, rainfall, irrigation, years),
compare results side by side, save runs, see the ranked recommendation.

Full spec, file layout and screen description: `docs/modules/simulator.md` section 6.
Look and honesty rules: `DESIGN.md`.

- `types.ts` mirrors the backend `schemas.py`. Change both together.
- All scenario inputs carry the `SCENARIO` tag, all results `MODELLED`.
- `api/` calls `/api/farms/{id}/simulations`.
