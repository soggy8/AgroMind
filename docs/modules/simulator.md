# Simulator: architecture and status

The Farm Simulator compares crop rotations on one field under a hypothetical climate scenario
and ranks them against the farmer's priorities. It is a decision-support model, never a harvest
forecast.

Read with: `DESIGN.md` (look and honesty rules), `README.md` (module dependency rules),
`docs/modules/simulator_calibration.md` (how well the model matches real yields).

**Status (2026-11-14): built end to end.** Engine, API, calibration, saved runs, economics,
advisor hand-off and the UI all work on the demo farm. 33 backend tests pass. What is still
missing is listed in section 8.

---

## 1. Run it

```bash
# Backend (from backend/)
pip install -e ".[dev]"                  # or use the existing backend/.venv
alembic upgrade head                     # farms, fields, soil, saved runs
python -m app.modules.croptwin.seed      # demo farm (ids demo / north / creek / west)
uvicorn app.main:app --reload --port 8000
pytest                                   # all modules; simulator tests use an in-memory DB
python -m app.modules.simulator.calibration --write   # regenerate the calibration report

# Frontend (from frontend/)
npm install
npm run dev            # http://localhost:5173/#/simulator, proxies /api to 127.0.0.1:8000
npm run build          # type-check + production build
```

If port 8000 is taken, run the API on another port and start Vite with
`AGROMIND_API=http://127.0.0.1:<port> npm run dev`.

---

## 2. Design decisions

1. **Transparent rules, no ML.** FAO-56 crop water requirements (Penman-Monteith ET0, Kc curve,
   daily soil water balance) and yield response to water (Eq. 90), plus a heat rule and a rotation
   rule. Every rule and every assumed number is listed in the result's `assumptions`.
2. **The engine is pure** (`engine/`): dataclasses and numpy in, numpy out. No FastAPI, pydantic,
   database or network.
3. **Uncertainty comes from real weather years.** Each rotation is replayed once per historical
   start year (25 tracks, 2001-2025, vectorised so a full run takes about 0.3 s). Results are
   p10 / p50 / p90 across tracks. Parameter uncertainty is not included, and the UI says so.
4. **Lead with change versus today's climate.** Every run also simulates the same rotations
   without the climate shift and reports `vs_baseline`. The UI leads with that change.
5. **Yields are relative.** 100% = the crop's average modelled yield under today's climate,
   rain-fed, after a different crop. Where an Iowa budget yield exists, t/ha = relative x that yield.
6. **Calibrated to county yields.** See section 5.
7. **Scenario is not a forecast.** Inputs are tagged `SCENARIO`, outputs `MODELLED`, the baseline
   climate `OBSERVED`.
8. **Stateless run, optional save.** Saving reruns the request and stores request + result.
9. **Recommendation text is rule-generated** from the numbers in the result (`ranking.py`). The AI
   advisor gets a fact list built from the result (`advisor.py`) and must not go beyond it.

---

## 3. Backend layout

```
backend/app/modules/simulator/
├── router.py        HTTP only: parse, call service, map errors (404 / 422 / 503)
├── service.py       orchestration; the only file other modules may import
├── schemas.py       API contract, mirrored by frontend/src/modules/simulator/types.ts
├── parameters.py    crop, soil, economic parameters and engine constants, each with a source
├── ports.py         the only access to field data and weather (stand-ins, see section 7)
├── rotations.py     validation, planting schedule, suggested rotations
├── scenarios.py     apply a scenario to weather, presets, climate summaries
├── ranking.py       indicator scores, ranking, recommendation text
├── advisor.py       fact list for the AI advisor
├── models.py        SimulationRun table (saved runs)
├── store.py         saved runs: save / list / get / delete
├── calibration.py   CLI: fit against USDA NASS county yields, write the report
├── engine/
│   ├── types.py         Climate (n_years x 365 arrays), SoilProfile, FieldSnapshot, Planting, EnsembleOutcome
│   ├── et0.py           FAO-56 Penman-Monteith (Eq. 6), Hargreaves fallback (Eq. 52)
│   ├── soil_water.py    FAO-56 Table 19 soils, Saxton & Rawls (2006) pedotransfer, USDA texture class
│   ├── crop_models.py   Kc curve, water factor (Eq. 90), heat factor, rotation factor
│   ├── water_balance.py daily root-zone balance, Ks (Eq. 84)
│   ├── soil_health.py   rotation soil index
│   └── runner.py        ensemble loop over weather years
└── economics/
    ├── costs.py     per-season cost (ISU 2026 budgets) + irrigation cost
    └── revenue.py   relative yield x typical yield x price
```

### API

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/farms/{farm_id}/simulations/options` | → `SimulatorOptions` (farm, fields with boundaries, crops, presets, defaults) |
| POST | `/api/farms/{farm_id}/simulations/run` | `SimulationRequest` → `SimulationResult` |
| POST | `/api/farms/{farm_id}/simulations/advisor-context` | `SimulationResult` → `AdvisorContext` |
| POST | `/api/farms/{farm_id}/simulations` | `SaveRunRequest` → `SavedRun` (201) |
| GET | `/api/farms/{farm_id}/simulations` | → `SavedRunSummary[]` |
| GET | `/api/farms/{farm_id}/simulations/{run_id}` | → `SavedRun` |
| DELETE | `/api/farms/{farm_id}/simulations/{run_id}` | → 204 |

---

## 4. The model

**Weather.** NASA POWER daily point data, 2001-2025, community `AG`: `T2M_MAX, T2M_MIN,
PRECTOTCORR, ALLSKY_SFC_SW_DWN, RH2M, WS2M`. Feb 29 is dropped so every year has 365 days;
`-999` values are filled from the previous day and counted. The grid cell is about 0.5 x 0.625
degrees: regional weather, not the field's own. The demo farm's cell is committed as
`data/samples/power_daily_story_county_ia_2001_2025.csv`; other locations are fetched live and
cached under `data/cache/power/`.

**Scenario.** +dT on Tmax and Tmin every day; rain x (1 + dR). Humidity, wind and radiation stay
as observed. ET0 is recomputed from the shifted temperatures.

**ET0.** FAO-56 Penman-Monteith with mean RH. Tested against FAO-56 Example 18 (3.9 mm/day).
May-Sep average on the sample: 654 mm.

**Soil.** The demo field's 0-100 cm composition comes from SoilGrids (clay loam, 34% clay, 32%
sand, pH 6.5), committed as `data/samples/soilgrids_story_county_ia.json`. Field capacity and
wilting point come from Saxton & Rawls (2006), giving 135 mm of available water per metre. FAO-56
Table 19 (verified against the CRAN CropWaterBalance package) is the fallback for named textures.

**Water balance.** Daily, one layer, per FAO-56 chapter 8: TAW = AWC x Zr x storage multiplier;
Ks = 1 until depletion passes RAW = p x TAW, then falls linearly (Eq. 84). Irrigation refills the
root zone when depletion passes RAW (`full`), or does so until the season cap is used (`limited`).
Between crops: evaporation at Kc 0.3, scaled by soil wetness. Soil starts at field capacity on
Jan 1 of year 1 and carries over between seasons. Not modelled: runoff, snow, frozen soil, root
growth, nitrogen, pests, excess water.

**Yield.** `relative = water factor x heat factor x rotation factor / typical factor`.
- Water: `1 - Ky (1 - ETa/ETc)` over the season (FAO-56 Eq. 90, Ky from Table 24).
- Heat in today's weather: mid-season degree-days above the crop's threshold x 0.2% (calibrated),
  capped at 40%.
- Response to warming (scenario `heat_response`, default `published`): the scenario's extra
  degree-days above 29 °C (maize) or 30 °C (others), over the whole season and compared with the same
  year today, cost yield at a per-crop rate solved so +1 °C reproduces Zhao et al. (2017) US
  estimates (maize −10.3%, soybean −6.8%, wheat −5.5% per °C). `local` uses only the county's history,
  which implies about −2% per °C. Results always report the other setting's number too.
- Rotation: maize after maize x 0.915 (ISU 2026 budget yields 193 vs 211 bu/ac); other crops
  after themselves have assumed penalties.
- Typical factor: the crop's mean water x heat factor under today's climate, one rain-fed season
  per historical year. It makes 100% mean "a typical year today".

**Scheduling.** Each crop is planted on its usual day, up to 21 days late if the previous harvest
plus 7 days isn't done; otherwise next year. Seasons that end after the horizon are dropped.
Winter wheat spans two calendar years. The first season follows the field's current crop.

**Soil index (0-100).** Rule-based score of the rotation itself: diversity (up to 35), legume (25),
residue return (25), minus up to 15 for a crop following itself. Not a soil carbon prediction.

**Economics (optional).** Prices: USDA WASDE November 2026, 2026/27 projected season-average farm
prices (maize $4.60, soybean $12.10, oats $3.35 per bushel). Costs: ISU Ag Decision Maker A1-20
(2026) total cost per acre including $274/ac cash rent and labour (maize after soybean $911.98,
maize after maize $960.02, soybean $679.11). Oats cost and the $0.50/mm/ha irrigation cost are
assumptions. Winter wheat and sunflower have no Iowa budget, so rotations with them get no
economics. Margin = return to management. A scenario slider shifts all prices.

**Ranking.** Indicators on fixed 0-1 scales: yield (50% → 0, 110% → 1), water self-sufficiency
(share of need met without irrigation), risk (1 - share of seasons below 70% of typical), soil
index / 100, margin (−$750 → 0, +$750/ha/yr → 1, only with economics). Weighted by the farmer's
priorities (normalised). Top two within 0.03 → "too close to call".

---

## 5. Calibration (summary; details in `simulator_calibration.md`)

Uncalibrated, the model overstated drought losses: modelled maize anomaly spread 0.24 against
0.07 for Story County (USDA NASS, 2001-2025, detrended), and 2012 at 47% of typical against 88%.

Fix: one effective water-storage multiplier (2.6 x the FAO rooting depth) that stands in for
subsoil water and the water table in these deep, tile-drained soils, plus the heat loss rate.
Fitted to match the observed spread; applied only inside the calibrated grid cell. Elsewhere the
model runs uncalibrated and says so.

Honest limits:
- Year-to-year correlation with county yields is weak (r ≈ 0.2). Simple weather indices also
  correlate weakly with this county's yields, so this is partly the county, but the model should
  not be used to explain a single year.
- The soybean check matches the spread but not the timing (r ≈ −0.4 over 9 years).
- The county's history implies a much smaller response to warming (about −2% per °C for maize) than
  published US averages (−10.3%). Both are offered; the published one is the default and the UI
  always shows the other number.

---

## 6. Frontend

```
frontend/src/
├── app/                      App shell: hash routes, TopBar, placeholder pages for other modules
├── shared/
│   ├── api/http.ts           fetch wrapper with readable errors
│   ├── components/           Glass, Button, SegmentedTabs, KindTag, Skeleton (DESIGN.md section 6)
│   └── map/FarmMap.tsx       Esri World Imagery + field outlines + name chips + glass zoom
└── modules/simulator/
    ├── types.ts              mirrors schemas.py
    ├── api/simulatorApi.ts
    ├── state/useSimulator.ts one reducer: options, draft, result, stale flag, saved runs
    ├── lib/                  format.ts, rotationColors.ts
    ├── pages/SimulatorPage.tsx  desktop: map + two floating panels; < 1024 px: map + tabbed sheet
    └── components/
        ├── SetupPanel.tsx         field, RotationBuilder, ScenarioControls, PriorityControls, Run
        ├── ResultsPanel.tsx       RecommendationBlock + tabs Compare / Seasons / Assumptions / Saved
        ├── ChangeVsToday.tsx, ClimateCompare.tsx, IndicatorBars.tsx, WeatherYearsChart.tsx
        ├── SeasonTable.tsx, AssumptionsList.tsx, SavedRuns.tsx
        └── AdvisorDrawer.tsx      the facts the advisor may use (advisor not connected yet)
```

Behaviour worth knowing:
- Rotations keep their colour from their position in the request (`input_index`), not their rank.
- Changing any input after a run dims the results and offers "Run again"; saving is disabled
  until results are current. Ctrl/Cmd+Enter runs.
- The map never recolours fields with model output.

Checked in headless Chromium at 1440x900, 800x1000 and 390x844: no console errors, no
horizontal scroll on phones.

---

## 7. Dependencies on other modules

| Need | From | Today |
|---|---|---|
| Farm, fields, boundaries, current crop, priorities | `croptwin.service` | **Connected** (`ports.get_farm`, `ports.load_field`) |
| Soil | CropTwin soil layers, else the field's texture class, else assumed loam (said in the UI) | **Connected** |
| Daily weather | `shared/connectors/nasa_power.py` | Not built yet: `ports.load_climate` uses the committed sample for the demo cell, live POWER with a disk cache elsewhere |
| Saved runs | `shared/db` | **Connected**: table `simulation_runs` (migration 0002), `store.py` |
| AI answers | `shared/advisor` | Not built yet: `POST .../advisor-context` returns the facts; the UI shows them |

Every service function takes the request's database session, like CropTwin's.

---

## 8. Still to do

1. Swap `ports.load_climate` to the shared POWER connector once it exists.
2. Connect the advisor drawer to `shared/advisor` once it exists.
3. Calibrate more: soybean timing, a second county, and the heat rule against a published
   sensitivity.
4. Replace ASSUME values (oats costs, planting dates, non-maize rotation penalties) with sources.
5. Optional: code-split the map and chart libraries (the production bundle is about 600 kB).
