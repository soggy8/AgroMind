# AgroMind documentation

Start with the repo [README](../README.md) for how to run the app and module boundaries. This folder
holds deeper notes for each piece of the system.

## Architecture and data

| Document | Contents |
|---|---|
| [architecture.md](architecture.md) | Modules, API prefixes, database schema, platform layout |
| [data-sources.md](data-sources.md) | NASA and supporting datasets, connector status, licence notes |

## Modules

| Module | Spec / status |
|---|---|
| [modules/croptwin.md](modules/croptwin.md) | Farm profile API and UI; what's built and what's assumed |
| [modules/croptwin_handoff.md](modules/croptwin_handoff.md) | CropTwin merge guide for teammates (features, files, pitfalls) |
| [modules/cropdoctor.md](modules/cropdoctor.md) | Command Center, health API, findings rules |
| [modules/simulator.md](modules/simulator.md) | Engine, scenarios, calibration, UI features |
| [modules/simulator_calibration.md](modules/simulator_calibration.md) | How well the demo model fits county yields |
| [modules/assistant.md](modules/assistant.md) | Natural-language assistant, tools, grounding |

## Design and product

| Document | Contents |
|---|---|
| [../DESIGN.md](../DESIGN.md) | Visual system (tokens, glass panels, honesty in UI copy) |
| [design/command-center-sketch.html](design/command-center-sketch.html) | Early Command Center reference (map is placeholder; use real imagery in app) |
| [agromind-presentation-brief.md](agromind-presentation-brief.md) | Narrative brief for slides or pitch decks |

## Per-folder READMEs

Backend and frontend trees include short `README.md` files next to each module and under `shared/`.
Those describe file responsibilities; module specs above stay the source of truth for behaviour.