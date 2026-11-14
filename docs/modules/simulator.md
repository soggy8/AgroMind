# Simulator: architecture and build spec

The Farm Simulator compares crop rotations on one field under a hypothetical climate scenario
and ranks them against the farmer's priorities. It is a decision-support model, never a harvest
forecast.

Read with: `DESIGN.md` (look and honesty rules), `README.md` (module dependency rules).

**Already written, treat as the contract:**

| File | What it fixes |
|---|---|
| `backend/app/modules/simulator/schemas.py` | API request and response shapes |
| `frontend/src/modules/simulator/types.ts` | The same shapes for the UI (hand-mirrored) |
| `backend/app/modules/simulator/parameters.py` | Crop and soil parameters with a source per value |
| `backend/app/modules/simulator/engine/types.py` | Data types crossing the engine boundary |
| `data/samples/power_daily_story_county_ia_2001_2025.csv` | 25 years of real NASA POWER daily weather for the demo location (42.03 N, 93.46 W) |
| `docs/modules/simulator_prototype.py` | Throwaway reference with working equations |

Everything else in the module is an empty file to implement.

---

## 1. Design decisions

1. **Transparent rules, no ML.** FAO-56 crop water requirements and yield response to water,
   plus a simple heat rule and a rotation rule. Every rule is listed in the result's `assumptions`.
2. **The engine is pure.** `engine/` takes dataclasses and returns dataclasses: no FastAPI,
   pydantic, database or network. That keeps it testable and lets it run on the sample file
   before CropTwin and the connectors exist.
3. **Uncertainty comes from real weather years.** The run is repeated once per historical start
   year (the "ensemble"); results are reported as p10 / p50 / p90 across those tracks. Parameter
   uncertainty is not included, and the UI must say so.
4. **Lead with change versus today's climate.** Each run also simulates the same rotations with
   no scenario changes, and reports `vs_baseline`. Section 4 explains why absolute levels can't
   be trusted yet.
5. **Scenario is not a forecast.** Scenario inputs perturb observed weather; they are tagged
   `SCENARIO`, outputs `MODELLED`, the baseline climate summary `OBSERVED`.
6. **Stateless run, optional save.** `POST .../run` computes and returns. Saving stores the
   request and result JSON. A full run is about 25 tracks x 10 years x 4 rotations x 2 climates
   = 730k daily steps: fine synchronously in plain Python, no job queue.
7. **Recommendation text is rule-generated** from the numbers in the result. The AI advisor
   receives the `SimulationResult` JSON as its only context and explains it.

---

## 2. Backend layout

```
backend/app/modules/simulator/
├── router.py          HTTP only: parse, call service, return
├── schemas.py         API contract                               [written]
├── parameters.py      crop + soil parameters, engine constants   [written]
├── service.py         orchestration (the only file other modules may import)
├── ports.py           load_field(), load_weather(): the only place that touches
│                      croptwin.service and shared.connectors; falls back to the sample
├── scenarios.py       apply a Scenario to weather; scenario presets; climate summaries
├── rotations.py       validate a rotation; place plantings on the timeline; suggested rotations
├── ranking.py         indicator scores, weighted score, rank, recommendation text
├── models.py          SimulationRun table (saved runs)
├── engine/
│   ├── types.py           WeatherDay, FieldSnapshot, Planting, SeasonOutcome   [written]
│   ├── et0.py             reference evapotranspiration
│   ├── water_balance.py   daily root-zone water balance
│   ├── crop_models.py     Kc curve, heat factor, water factor, rotation factor
│   ├── soil_health.py     rotation soil index
│   └── runner.py          the ensemble loop; aggregation into p10/p50/p90
└── economics/
    ├── costs.py           per-crop cost per ha, irrigation cost per mm
    └── revenue.py         price x yield, margin
```

`ports.py`, `models.py`, `engine/et0.py` and `engine/runner.py` are new files to create.

### Request flow

```
router ── service.run_simulation(farm_id, SimulationRequest)
            ├─ ports.load_field(field_id)            → FieldSnapshot
            ├─ ports.load_weather(lat, lon)          → list[WeatherDay], source note
            ├─ rotations.validate(...)               → 422 on unknown crop ids
            ├─ scenarios.apply(weather, scenario)    → perturbed weather
            ├─ for climate in (baseline, scenario):
            │    for rotation: runner.run(field, rotation, weather, irrigation, years)
            │                    → list[SeasonOutcome]
            ├─ runner.aggregate(...)                 → per-season and per-rotation Stats
            ├─ soil_health.index(rotation)
            ├─ economics (only if include_economics)
            ├─ ranking.rank(rotations, priorities)   → scores, ranks, Recommendation
            └─ build SimulationResult
```

### Function signatures

```python
# engine/et0.py
def extraterrestrial_radiation(lat_deg: float, doy: int) -> float            # MJ/m2/day
def penman_monteith(day: WeatherDay, lat_deg: float, elevation_m: float) -> float   # mm/day
def hargreaves(day: WeatherDay, lat_deg: float) -> float                     # fallback, mm/day

# engine/crop_models.py
def kc_on_day(crop: CropParams, days_after_planting: int) -> float
def stage_on_day(crop: CropParams, days_after_planting: int) -> str          # initial|development|mid|late
def water_factor(crop: CropParams, eta_mm: float, etc_mm: float) -> float
def heat_factor(crop: CropParams, heat_degree_days: float) -> float
def rotation_factor(crop: CropParams, predecessor_crop_id: str | None) -> float

# engine/water_balance.py
@dataclass
class SoilWater: depletion_fraction: float                                   # 0 = full, 1 = empty
def step(state, *, et0, kc, rain, taw, p, irrigate: bool, irrigation_left: float | None)
        -> tuple[SoilWater, DayFluxes]                                       # etc, eta, irrigation, drainage

# engine/runner.py
def run(field: FieldSnapshot, crops: list[str], weather: list[WeatherDay], *,
        years: int, irrigation: str, irrigation_cap_mm: float | None) -> list[SeasonOutcome]
def aggregate(outcomes: list[SeasonOutcome]) -> ...                          # percentiles per season and overall

# engine/soil_health.py
def rotation_soil_index(crops: list[str]) -> tuple[int, dict[str, int], list[str]]

# scenarios.py
def apply(weather: list[WeatherDay], scenario: Scenario) -> list[WeatherDay]
def summarise(weather, lat, kind, source) -> ClimateSummary
PRESETS: list[ScenarioPreset]

# rotations.py
def schedule(crops: list[str], years: int, previous_crop_id: str | None) -> list[Planting]
SUGGESTED: list[RotationInput]

# ranking.py
def rank(results: list[RotationResult], priorities: Priorities) -> tuple[list[RotationResult], Recommendation]

# service.py  (public interface)
def get_options(farm_id: str) -> SimulatorOptions
def run_simulation(farm_id: str, request: SimulationRequest) -> SimulationResult
def save_run / list_runs / get_run / delete_run
```

### API

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/farms/{farm_id}/simulations/options` | → `SimulatorOptions` |
| POST | `/api/farms/{farm_id}/simulations/run` | `SimulationRequest` → `SimulationResult` |
| POST | `/api/farms/{farm_id}/simulations` | `SaveRunRequest` → `SavedRun` |
| GET | `/api/farms/{farm_id}/simulations` | → `SavedRunSummary[]` |
| GET | `/api/farms/{farm_id}/simulations/{run_id}` | → `SavedRun` |
| DELETE | `/api/farms/{farm_id}/simulations/{run_id}` | → 204 |

Errors: 404 unknown farm or field, 422 unknown crop id or invalid scenario. If live weather
can't be fetched, still answer from the sample and set `data_note` to "Sample data (offline)".

---

## 3. The model

Sources: **FAO-56** = Allen, Pereira, Raes, Smith (1998), *Crop evapotranspiration*, FAO
Irrigation and Drainage Paper 56, https://www.fao.org/4/X0490E/x0490e00.htm.
Values marked FAO in `parameters.py` were read from that text during research.

**Step 1. Baseline weather.** Daily NASA POWER series for the field's location, 2001 onward:
`T2M_MAX, T2M_MIN, PRECTOTCORR, ALLSKY_SFC_SW_DWN, RH2M, WS2M` (community `AG`). Verified
working request:

```
https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M&community=AG&longitude=-93.46&latitude=42.03&start=20010101&end=20251231&format=JSON
```

Missing values are `-999`: fill from the previous day and count them in `data_note`. The grid
cell is about 0.5 x 0.625 degrees, so this is regional weather, not the field's own.

**Step 2. Scenario.** Add `temp_delta_c` to Tmax and Tmin every day. Multiply every day's rain
by `1 + rain_change_pct/100` (wet-day frequency unchanged). Relative humidity, wind and solar
stay as observed. These are uniform shifts, not climate-model projections: say so in the UI.

**Step 3. Reference evapotranspiration ET0.** FAO-56 Penman-Monteith (Eq. 6) with mean RH
for actual vapour pressure. Working code in the prototype. Hargreaves is the fallback when
radiation, humidity or wind are missing. On the sample, May-Sep ET0 averages 654 mm with
Penman-Monteith and 708 mm with Hargreaves, which is why Penman-Monteith is the default.

**Step 4. Crop water need.** `ETc = Kc x ET0`. Kc follows the FAO-56 four-stage curve: flat
at Kc ini, linear rise through development, flat at Kc mid, linear fall to Kc end.

**Step 5. Daily soil water balance** (FAO-56 chapter 8):

```
TAW = 1000 x (theta_FC - theta_WP) x Zr        total available water, mm        (Eq. 82)
RAW = p x TAW                                  readily available water          (Eq. 83)
Ks  = 1                          if Dr <= RAW
      (TAW - Dr) / ((1 - p) TAW) if Dr >  RAW  water stress coefficient         (Eq. 84)
ETa = Ks x Kc x ET0
Dr  = clamp(Dr - rain - irrigation + ETa, 0, TAW)     anything above full drains away
```

- Between crops: `Kc = FALLOW_KC`, `Zr = FALLOW_ROOT_DEPTH_M`, evaporation scaled by how full
  the soil is. Carry the *fraction* depleted across crop changes, because TAW changes with Zr.
- Each track is one continuous daily loop over `years` consecutive weather years, so soil
  water carries over between seasons. Track k starts at historical year k and wraps around.
- Irrigation: `full` refills the root zone whenever `Dr > RAW`; `limited` does the same until
  the season's cap is used up; `none` never irrigates. Reported irrigation is net water applied.
- Not modelled: runoff, snow and frozen soil, shallow groundwater, root growth during the season.

**Step 6. Yield.** `relative_yield = water_factor x heat_factor x rotation_factor`, each 0-1.

- Water: `1 - Ky x (1 - sum ETa / sum ETc)` (FAO-56 Eq. 90, Ky from Table 24).
- Heat: degree-days of Tmax above the crop's `heat_tcrit_c` during mid-season, times
  `heat_loss_per_degday`, capped at `HEAT_LOSS_CAP`. **Assumption, uncalibrated.**
- Rotation: `monoculture_factor` when a crop follows itself, otherwise 1. **Assumption.**
  Check against Seifert, Roberts and Lobell (2017), *Agronomy Journal*, on continuous corn and
  soybean yield penalties.
- `yield_t_ha = relative_yield x ref_yield_t_ha` where a reference yield exists.
- `limiting_factor` = whichever factor is lowest, or "none" when all are above 0.95.

**Step 7. Scheduling.** A crop is planted at its `plant_doy`, or up to `PLANT_WINDOW_DAYS`
later if the previous harvest plus `MIN_TURNAROUND_DAYS` isn't done yet; otherwise it waits
for next year. The rotation repeats until `years` are filled. The first season's predecessor
is the field's `previous_crop_id`. Winter wheat spans two calendar years: test that case.

**Step 8. Soil index (0-100).** A rule-based score of the rotation itself, not a prediction of
soil carbon. Suggested weights: crop diversity 35 (distinct crops, more for distinct
families), legume present 25, residue return 25 (share of high-residue crops), minus up to 15
for back-to-back repeats. Return the components and a plain note per component.
Evidence to cite for the demo region: Davis et al. (2012), *PLoS ONE* 7(10): e47149, the
Marsden Farm long-term rotation study in Boone County, Iowa (verify details before quoting).

**Step 9. Economics (optional).** Per crop: price per tonne, cost per ha, cost per mm of
irrigation. No values are in the repo yet. Take them from Iowa State University Extension's
*Estimated Costs of Crop Production in Iowa* (Ag Decision Maker A1-20) and USDA NASS prices,
record the year, and expose them as editable `SCENARIO` inputs. Skip this until steps 1-8 work.

**Step 10. Ranking.** Each indicator becomes a 0-1 score on a fixed scale (not min-max across
the options, which would exaggerate small gaps):

| Indicator | Score |
|---|---|
| yield | p50 relative yield |
| water | p50 rain sufficiency = share of crop water need met by rain alone |
| risk | 1 - stress season frequency |
| soil | soil index / 100 |
| margin | margin relative to the best option; only when economics is on |

`score = sum(weight x indicator score)` with weights normalised to 1. If the top two are within
`NEAR_TIE_MARGIN`, set `near_tie` and word the headline as "too close to call between X and Y".
Reasons name the two indicators that contributed most and quote their numbers; trade-offs name
any indicator where the winner is not best.

---

## 4. Known problem: the model overstates stress

The prototype ran maize, soybean and oats on the sample weather. It ranks years sensibly (2012,
the driest season in the sample at 267 mm May-Sep, comes out worst for every crop) but the
levels are too low: median rain-fed maize relative yield is about 0.7-0.8 under today's climate
and about 0.2 in 2012. Real Iowa maize yields in 2012 fell by roughly a quarter, not
four-fifths (check the exact Story County figure in USDA NASS Quick Stats).

Likely causes: the reanalysis weather is hotter and drier than station data in drought years
(35 days at or above 35 C in 2012 in this grid cell), Iowa soils hold more water and are
rooted deeper than the generic defaults, and shallow groundwater is ignored.

What to do about it:

1. Report `vs_baseline` and lead the UI with it. Already in the contract.
2. **Calibrate before the demo.** Pull Story County maize and soybean yields for 2001-2025
   from USDA NASS, remove the trend, and compare year by year with modelled relative yield.
   Tune only values marked ASSUME (heat rule, soil depth and texture for the demo field, heat
   cap). Report the correlation and the 2012 anomaly in the assumptions list.
3. If calibration isn't done, say so in `data_note`. Never present t/ha as a prediction.

---

## 5. Dependencies on other modules

Neither exists yet, so `ports.py` hides both behind two functions.

| Need | From | Until it exists |
|---|---|---|
| Field location, area, soil texture, previous crop, irrigation, priorities | `croptwin.service` | A hard-coded demo field in `ports.py`: "North Field", 40 ha, loam, maize, 42.03 N 93.46 W (matches the design sketch) |
| Daily weather | `shared/connectors/nasa_power.py` | Read the CSV in `data/samples/` |

Agree with the CropTwin owner on: field id format, soil texture names (the keys of
`parameters.SOILS`), and how priorities are stored (map them onto `Priorities`).

`DESIGN.md` refers to a `Labelled` type "in the build plan" and to `PRODUCT.md`. Neither is in
the repo. The simulator contract carries kind and source at block level (`ClimateSummary.kind`,
`SimulationResult.kind`, `Assumption.source`); reconcile with `Labelled` when it appears.

---

## 6. Frontend

```
frontend/src/modules/simulator/
├── types.ts                 mirrors schemas.py                    [written]
├── api/simulatorApi.ts      getOptions, runSimulation, saveRun, listRuns, getRun, deleteRun
├── state/useSimulator.ts    one reducer: draft, status, result, savedRuns
├── lib/rotationColors.ts    rotation index → lime | rain | water | soil
├── lib/format.ts            units, signed deltas, Stat → "62% (41-88%)"
├── pages/SimulatorPage.tsx  shell: map + two panels
└── components/
    ├── ScenarioPanel.tsx        left panel
    │   ├── FieldPicker.tsx
    │   ├── RotationBuilder.tsx  up to 4 rotations; add, remove, reorder crops
    │   ├── ScenarioControls.tsx sliders, irrigation segmented control, years
    │   └── PresetChips.tsx
    ├── ResultsPanel.tsx         right panel
    │   ├── RecommendationBlock.tsx
    │   ├── ClimateCompare.tsx   observed vs scenario climate
    │   ├── IndicatorBars.tsx    one bar group per indicator, p10-p90 whisker
    │   ├── SeasonTable.tsx      rotation x season grid
    │   ├── AssumptionsList.tsx
    │   └── SavedRuns.tsx
    └── ScenarioMapPill.tsx      glass pill on the map: "Scenario · +2 °C · −20% rain"
```

### Screen (desktop), same shell as the Command Center

- **Left panel, 350px: "Set up".** Field picker, then the rotations (each a row with its colour
  dot and crop chips), then scenario controls under a `SCENARIO` kind tag, then the one primary
  button, "Run simulation". Preset chips: "Today's climate", "Hotter and drier" (+2 °C, −20%),
  "Severe" (+4 °C, −30%).
- **Right panel, 410px: "Results".** Top block is the recommendation: 21px headline, the
  reasons, the trade-offs, and "too close to call" wording on a near tie. Use a neutral or
  lime-tinted wash, not the warm finding wash, which means a problem. Below it, segmented tabs:
  `Compare` (climate comparison, then indicator bars), `Seasons` (table), `Assumptions`.
  Every chart header carries a `MODELLED` tag. The panel ends with the data note.
- **Map.** The selected field stays outlined. Scenario pill sits in the gap between panels.
  The map does not change colour with scenario results: NDVI is observed data.
- Lead each rotation's numbers with the change versus today's climate ("−22% yield vs today"),
  with the absolute level and the p10-p90 range as secondary text.
- Rotations keep one colour everywhere (DESIGN.md section 7). Max four.
- Before the first run the right panel explains what the simulator does and that results are
  model estimates. Changing any input after a run marks the results as stale rather than
  clearing them.

Tablet and phone follow DESIGN.md section 5: on phones the bottom sheet tabs are
`Set up · Results · Advisor`. States from DESIGN.md section 9 all apply; simulator-specific
ones: running (skeleton bars), field has no soil data (uses loam, says so), offline sample.

Shared pieces (`Glass`, `Button`, `Tabs`, `KindTag`, the map) belong in `frontend/src/shared/`.
If they don't exist yet, build them there to the DESIGN.md spec and tell the team, rather than
making simulator-only copies. Bars and tables are simulator-private until someone else needs them.

No new dependencies beyond DESIGN.md section 11. State is one `useReducer`; fetch is plain `fetch`.

---

## 7. Build order

Each step ends with something runnable. Run tests from `backend/` with `pytest`.

1. **Engine on the sample.** `et0`, `crop_models`, `water_balance`, `runner`, a CSV loader in
   `ports.py`. Tests: ET0 for the sample averages 640-670 mm for May-Sep; Kc curve hits the
   table values at stage boundaries; Ks reproduces FAO-56 Example 37 (TAW 160, p 0.40,
   Dr 83.4 gives 0.80); a wetter scenario never lowers the water factor; full irrigation gives
   water factor 1; 2012 is the worst maize year.
2. **Scheduling and scenarios.** Winter wheat after soybean; a one-crop rotation; ten years.
3. **Service + router** on the demo field, returning a full `SimulationResult`. Add a
   `pyproject.toml` and `main.py` wiring if the team hasn't yet (agree first).
4. **Soil index and ranking**, with tests for near ties and for weights that change the winner.
5. **Calibration** (section 4).
6. **Frontend**: types and API client, then the left panel, then results, then states.
7. **Saved runs** (`models.py`, needs `shared/db`), then economics, then advisor hand-off.

Suggested demo rotations for the Iowa demo field: A maize-maize, B maize-soybean,
C maize-soybean-oats. Chickpea is not in the catalogue: FAO-56 has no stage lengths or Ky for it.

---

## 8. Things to verify before relying on them

- `parameters.SOILS` was written from memory of FAO-56 Table 19: check each row.
- Kc ini values are the FAO-56 crop-group values, not crop-specific rows.
- Planting dates, reference yields and monoculture factors are ASSUME.
- Oats uses the spring wheat Ky as a proxy.
- The two papers named in section 3 were cited from memory: confirm before quoting them.
