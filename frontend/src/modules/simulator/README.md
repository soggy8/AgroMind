# Simulator (UI)

Farm Simulator page (`#/simulator`): pick a field and rotations, set the scenario and priorities,
run, then read the recommendation, the change vs today's climate, indicators, season details,
assumptions, and saved runs.

Spec and file layout: `docs/modules/simulator.md` section 6. Look and honesty rules: `DESIGN.md`.

- `types.ts` mirrors the backend `schemas.py`. Change both together.
- Scenario inputs carry the `SCENARIO` tag, results `MODELLED`, observed climate `OBSERVED`.
- All state lives in `state/useSimulator.ts`.
