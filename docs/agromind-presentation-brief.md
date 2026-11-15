# AgroMind — Brief for presentation (Gemini / slides)

Use this as source text for slides, speaker notes, or a deck outline. Ask Gemini to produce “10 slides for judges,” “5-minute pitch,” or “technical + vision mix.”

---

## One-liner and tagline

**AgroMind** is a **farm digital twin** with a **crop-rotation simulator**, built for the **NASA Space Apps Challenge** theme **“Field Shift: Adapting Farms with NASA Data.”**

**Tagline:** *Understand your farm. Test its future. Make better decisions.*

---

## The problem AgroMind addresses

Farmers face three intertwined challenges:

1. **Awareness** — Is something wrong in a specific field right now? Satellite and weather data exist but are hard to interpret at field scale.
2. **Uncertainty** — Climate is changing. Long-term choices (rotations, irrigation, cover crops) are hard to compare without transparent modelling.
3. **Trust** — Many ag-tech tools oversell: fake precision, “AI diagnosis,” or numbers with no source. Farmers need **honest labelling** of what is measured, modelled, or hypothetical.

AgroMind ties **NASA Earth observations**, **soil data**, and **farmer priorities** into one interface: **see the farm today**, **investigate stress cautiously**, and **compare futures** without pretending to predict exact harvests.

---

## What AgroMind is (in plain language)

AgroMind is a **web application** (React frontend, Python/FastAPI backend) that:

- Stores a **digital profile** of a farm: field boundaries on a map, crops, soil, irrigation, history, and what the farmer cares about (yield, water, risk, soil health, margin).
- **Monitors** fields using satellite greenness and weather, compares them to each field’s own long-term normal, and surfaces **careful findings** (not diagnoses).
- **Simulates** crop rotations over **25 years of real historical weather**, optionally shifted by **user scenarios** or **NASA downscaled climate projections** (2050s / 2080s), then **ranks** rotations against the farmer’s priorities.
- Includes an **AI assistant** that can **operate the app in natural language** (“show March 2016,” “run 2 °C hotter with full irrigation”) and answer **only from numbered facts** produced by the modules—never inventing measurements.

**Visual identity:** A dark “field console” with **real satellite imagery** full screen and **frosted-glass panels** floating over the map—the farm stays visible behind the data.

---

## NASA Space Apps context

- **Challenge:** Field Shift — adapting agriculture with NASA and open Earth data.
- **Positioning:** AgroMind is **built for Space Apps**; it is **not** an official NASA product and is **not** NASA-endorsed (disclaimer on the landing page).
- **NASA data used prominently:**
  - **NASA POWER** — daily ag weather (rain, temperature, sun, humidity, wind) since 2001.
  - **MODIS** — 16-day **NDVI/greenness** at ~250 m, field-scale monitoring in the Command Center.
  - **NASA NEX-GDDP-CMIP6** — downscaled **climate change projections** (multiple models, emissions scenarios, mid/late century) for the Simulator.
- **Supporting open data:** ISRIC **SoilGrids** (soil properties), USDA crop layers and county yield references for calibration and validation, FAO-56 methods for crop water use in the simulator.

**Demo geography:** A seeded **Story County, Iowa** demo farm (multiple named fields) so judges can explore without setting up a real operation.

---

## The three modules (core story — good for 3 slides)

| Module | Question | What it does |
|--------|----------|--------------|
| **CropTwin** | *What is my farm?* | Farm profile: draw fields on the map, soil (including SoilGrids prefill), crop history, irrigation, **priority weights** and constraints. **Source of truth** for everything else. |
| **CropDoctor** | *What is happening now?* | **Command Center:** map layers (greenness / satellite), per-field indicators, season charts vs **10-year normal**, optional **findings** when something drifts—worded as observation + anomaly + possible explanation + **recommended ground check**. Explicitly **does not** claim to detect disease or confirm stress from space alone. |
| **Simulator** | *What could happen next?* | Compare up to **four crop rotations** under today’s climate vs **what-if** (hotter, drier, etc.) or **NASA projections**. Uses **transparent agronomic rules** (FAO-56 water balance, published heat/yield response, rotation effects)—**no black-box ML** for core physics. Results stress **change vs baseline**, **relative yields**, and **p10/p50/p90** across many historical weather years—not a single “predicted t/ha.” |

**Architecture idea (one bullet for a technical slide):** Three modules share a common **data/advisor layer**; CropDoctor and Simulator **only read the farm through CropTwin**, keeping boundaries clean for a team-built codebase.

---

## Honesty and labelling (differentiator — strong slide)

Every number in the UI is tagged as one of:

- **Observed** — measured or farmer-reported (e.g. boundary, stated yield).
- **Modelled** — algorithm or map product (e.g. SoilGrids, crop water model, relative yield index).
- **Scenario** — hypothetical inputs (e.g. +2 °C, NASA SSP pathway).

CropDoctor findings avoid language like “disease detected” or “caused by.” The Simulator leads with **relative change under climate stress**, not absolute harvest promises. Assumptions and sources are listed where users can see them.

---

## AI assistant (optional “wow” slide)

- Opens with **“Ask the advisor”** or **Ctrl+K** from anywhere.
- Understands goals in natural language and **drives the UI**: dates, fields, simulator inputs, runs, map highlights, printable reports.
- **Grounded answers:** facts come from each module’s structured outputs; citations link to those facts.
- **Farm edits** require **explicit user confirmation** before saving.
- Default LLM provider can use a free tier; requires an API key in deployment.

This is **decision support and navigation**, not a replacement for agronomists or on-foot inspection.

---

## User journey (narrative for one slide)

1. **Landing** — Globe hero, module overview, NASA data table, honesty section.
2. **Farm profile** — Set up or explore the demo farm on satellite imagery.
3. **Command Center** — Pick a date (including a **historical replay** where data shows stress), inspect fields, read a cautious finding.
4. **Simulator** — Choose a field, build rotations, apply NASA climate scenario or custom shift, compare ranked outcomes, save runs, export a report.
5. **Assistant** — “Show me that stressed week” or “simulate rye cover crop under SSP5-8.5 2080s” while watching the app update.

---

## Technology stack (short)

- **Frontend:** React, TypeScript, Tailwind v4, map/globe (satellite basemap, field drawing), Playwright e2e tests.
- **Backend:** FastAPI, PostgreSQL/PostGIS (SQLite for simple local dev), Alembic migrations, modular `croptwin` / `cropdoctor` / `simulator` / `assistant`.
- **Data:** Committed **sample extracts** of real NASA/MODIS/POWER data for reliable demos; live fetch where appropriate for “today.”

---

## Who benefits

- **Farmers and advisors** — One place to align **current signals**, **farm context**, and **long-horizon rotation choices** under climate uncertainty.
- **Researchers and policymakers** — Transparent, citeable chain from **NASA open data** → indicators → scenarios.
- **Hackathon judges** — End-to-end product story: real NASA inputs, cautious monitoring, projection-backed planning, grounded AI, strong UX.

---

## Suggested slide outline for Gemini

1. Title — AgroMind + NASA Space Apps Field Shift  
2. Problem — climate + data overload + trust gap  
3. Solution — digital twin + simulator + honest labelling  
4. CropTwin — “What is my farm?”  
5. CropDoctor — “What’s happening now?” (MODIS + POWER, cautious findings)  
6. Simulator — “What if?” (25-year weather + NASA CMIP6 downscaling)  
7. NASA data map (POWER, MODIS, NEX-GDDP, SoilGrids)  
8. AI assistant — operates the app, grounded facts only  
9. Demo — Story County, Command Center replay, scenario comparison  
10. Impact, limitations, disclaimer, team / next steps  

---

## Disclaimers to include on a closing slide

- Not an official NASA product; not NASA endorsement.  
- Satellite monitoring **cannot rule out** pests, disease, or local issues—**ground truth** still required.  
- Simulator outputs are **decision-support models**, calibrated for demo context—**not** guaranteed yield forecasts.

---

## Sample Gemini prompt

> Create a [10-slide / 5-minute] presentation about **AgroMind** for the NASA Space Apps Challenge. Use the brief in the attached document. Tone: confident but honest, farmer- and judge-friendly, minimal jargon. Include speaker notes. Emphasize NASA data integration, the three modules, and the honesty labelling principle. Add one architecture diagram slide and one user-journey slide.