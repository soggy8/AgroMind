# Economics: design and status (module 5.5)

Module 5.5 of `AgroMind_Project_Plan.md`, "Optional Economic Intelligence", turned into a separate
backend module that puts the Simulator's results into money.

**Status (2026-11-15): built, backend and a first screen.** Owner: Kiril (backend design), andrej
(the screen). API at `/api/farms/{farm_id}/economics`; page at `#/economics` ("Farm money" in the top
bar). 53 backend tests (`backend/tests/economics/`), 2 Playwright tests (`frontend/e2e/economics.spec.ts`).
A report with the default 5 x 5 grid takes about 2.2 s after the Simulator has warmed up (limit: 7 s).
See section 15 for what changed during the build.

Read with: `README.md` (module rules), `DESIGN.md` section 8 (labels), `docs/modules/simulator.md`
(the model this module sits on), `docs/modules/simulator_calibration.md` (how far the numbers can be
trusted).

---

## 1. Why

The Simulator already gives revenue, cost and margin per rotation, so 5.5 as written in the plan
would mostly repeat it. What it does not do is answer the money questions a farmer actually asks
about adapting:

- What does the climate shift cost me if I keep doing what I do, and how much of that does a
  different rotation win back?
- How bad do the bad years get, and how much cash would I need to get through them?
- At what price or how much warming does the answer change?
- What if I use my own rent, prices and costs?

It also puts Field Shift into the one unit every judge understands.

## 2. Goals, non-goals, anti-goals

Goals (all four ship together):

1. **Climate bill**: your rotation's margin under today's climate and under the scenario, the change,
   the change for the whole field, the same change with the other heat response, and the best
   alternative's win-back.
2. **Bad-year money**: per rotation, how often a season loses money, the worst season, bad / typical
   / good seasons, and the cash cushion needed to get through the worst run of seasons.
3. **Who earns most**: a grid of warming against price change, each cell naming the rotation with
   the highest margin, with a rule-generated "switch point" sentence.
4. **Your numbers**: rent or own, and your own prices and costs, used by all three blocks and echoed
   back with their labels.

Non-goals (now): real historical prices, conservation payments and crop insurance
(ideas 4 to 6, see section 13); advisor facts; saving reports; crops other than maize, soybean and
oats.

Anti-goals: anything that reads as a price or harvest forecast; stock, commodity-trading or
long/short advice (`PRODUCT.md`); any number without its label and source; editing the Simulator's
code.

## 3. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **Separate `economics` module** reading the Simulator through `simulator.service` | Kiril owns it; no edits to andrej's files; the Simulator's public result already holds every weather year's yield (`track_seasons`). Costs: a second copy of prices and costs, a fourth box in the README diagram, and per-year irrigation is not exposed (section 6.6). | **Chosen** by Kiril |
| Extend `simulator/economics/` | Cleanest data access, but it is andrej's code and the team works one module each | Rejected |
| Hand the ideas to andrej | No duplicated data, but andrej is building the central dashboard | Rejected |

## 4. Constraints

- Module rules from `README.md`: Economics depends on the Simulator (and through it on CropTwin) and
  on `shared/`. It imports the Simulator **only** through `app.modules.simulator.service`, and only
  in its own `ports.py`. The Simulator, CropTwin and CropDoctor never import Economics.
- The money maths (`money.py`) is pure: numpy and dataclasses only, no FastAPI, pydantic, database
  or network, like the Simulator's `engine/`.
- `schemas.py` and `frontend/src/modules/economics/types.ts` are one contract: change both together.
  Types only, no screens.
- Labels (`DESIGN.md` section 8): every number carries Observed, Modelled or Scenario plus a source.
  Only those three kinds exist.
- The model has weak year-to-year skill and is calibrated only for the demo grid cell. Lead with
  change versus today and differences between rotations. Never call a margin a prediction.
- The API is metric (USD/ha, USD/t), like the Simulator. `units` only changes the sentences.
- No database tables, so no migration.

## 5. What it returns

The sketch agreed on 2026-11-15. The results are made up; the defaults in block 4 are the real ones.
andrej's dashboard decides the real look.

```
 FARM MONEY · Demo farm · North field (80 ha)         RESULTS ARE MADE UP
 Scenario: NASA 2050s, middle emissions [Scenario] · Prices: USDA Nov 2026
 1  THE CLIMATE BILL                                            [Modelled]
    Your rotation now: Corn–Soy
                           Today's climate   2050s climate     Change
    Margin per ha a year         $310            $120           −$190
    Whole field a year        $24,800          $9,600        −$15,200
    If yields react to heat like this county's history:  −$60/ha a year
    Best alternative: Corn–Soy–Oats + rye cover crop
    Margin in the 2050s          $190   → wins back $70 of the $190 (37%)
 2  BAD-YEAR MONEY · 25 replayed weather years, 2050s climate   [Modelled]
                               Corn–Soy   C–S–Oats+rye   Corn–Corn
    Seasons that lose money     36%          24%           56%
    Worst season (per ha)        −$410        −$280         −$620
    Bad (1 in 10) / typical / good (1 in 10) per season
    Cash cushion for the worst run of seasons
 3  WHO EARNS MOST? · warming (rows) vs price change (columns)  [Modelled]
    each cell: the rotation with the highest margin, or "too close"
    "Corn–Soy stops earning most between +1 °C and +2 °C at today's prices."
 4  YOUR NUMBERS · default (source) and yours ("Your number")   [Scenario]
    Land: rent $274/ac (ISU 2026) or own · prices (USDA WASDE) · costs (ISU 2026)
```

## 6. Calculations

### 6.1 Runs

Each report calls `simulator.service.run_simulation` with the same field, rotations, irrigation,
`years` and cover-crop settings, and `price_change_pct = 0` (this module applies prices itself):

| Run | Climate | Heat response | Used by |
|---|---|---|---|
| today | `temp_delta_c 0`, `rain_change_pct 0`, no projection | requested | block 1 |
| scenario | as requested | requested | blocks 1, 2 |
| other | as requested | the other one | block 1 ("this county's history" line) |
| grid row per warming level | uniform `temp_delta_c = w`, rain change below, no projection | requested | block 3 |

Grid rows use the scenario's rain change: `rain_change_pct` for slider scenarios, the projection's
May-Sep median rain change (`ProjectionInfo.rain_change_pct["median"]`) for NASA projections. The
response says which.

### 6.2 Season margin, per weather track

For rotation r, season s, track t (one track per historical start year, 25 for 2001-2025):

```
revenue[s,t] = track_seasons[t][s] x typical_yield_t_ha[crop] x price_usd_t[crop] x (1 + shift/100)
cost[s]      = cost_before_rent_usd_ha[crop, predecessor] + rent_usd_ha
               + irrigation_usd_per_mm_ha x irrigation_mm[s]
               + cover_crop_usd_ha if the rotation has a cover crop
margin[s,t]  = revenue[s,t] - cost[s]
```

- `predecessor` is the previous season's crop. For season 0 it is the field's current crop
  (`FieldOption.crop_id`). Maize after maize uses the corn-after-corn cost.
- Cover crops: the Simulator puts rye before every spring-planted season, and maize, soybean and
  oats are all spring-planted, so every priced season gets the cost. The consistency test
  (section 11) catches any change to that rule.
- `shift` is the price change. It applies to all crops, or to one crop when `price_crop` is set.
- `rent_usd_ha` is 0 when the farmer owns the land.

### 6.3 Per-track annual margin

`annual[t] = sum over s of margin[s,t] / years` (years with no harvest count, like the Simulator).
Stats are p10 / p50 / p90 across tracks. With default numbers this must equal the Simulator's
`Economics.margin_per_ha` (section 11).

### 6.4 Blocks

**Climate bill** (for "yours", the first rotation):
- `today` and `scenario`: stats of `annual` in each run.
- `change`: stats of `scenario.annual[t] - today.annual[t]`, paired by track (same weather years).
- `change_whole_field`: `change` x the field's `area_ha`.
- `other_heat_response_change`: p50 of the same paired change using the "other" run.
- `best_alternative`: the priced rotation other than yours with the highest scenario p50.
  `wins_back` = p50 of `alt.annual[t] - yours.annual[t]` in the scenario. `wins_back_share` =
  `wins_back / -change.p50`, only when `change.p50 < 0` and `wins_back > 0`. A share above 1 means
  it "more than makes up for it". None when no other priced rotation exists.

**Bad-year money** (each priced rotation, scenario run):
- `losing_season_share`: share of all (season, track) margins below 0.
- `losing_runs`: number of tracks whose total margin is below 0, out of the ensemble size.
- `worst_season`: the minimum season margin. `season_margin`: p10 / p50 / p90 of all season margins.
- `cash_cushion`: per track, `max(0, -min(running total of season margins))`, i.e. the cash needed at
  the start so the running total never goes negative. Report the worst track and the p50.

**Who earns most** (needs two or more priced rotations, otherwise `null` with a note):
- Rows: `warming_c` (default `[0, 1, 2, 3, 4]`). Columns: `price_change_pct` (default
  `[-30, -15, 0, 15, 30]`). Prices change by arithmetic, so only rows need runs.
- Cell: each rotation's `annual` p50. The winner has the highest p50. If the top two are within
  `NEAR_TIE_USD_HA`, the cell is a near tie with no winner.
- `your_cell`: the row nearest the scenario's warming (`temp_delta_c`, or the projection's May-Sep
  median temperature change) and the column nearest the requested `price_change_pct`. `exact` is
  false when either is not on the grid.
- Switch sentence (rule-generated): moving down the price-0 column (or the nearest column), the first
  row where yours stops winning gives "stops earning most between +a and +b °C at today's prices".
  Moving left from 0% along row 0, the first column where yours stops winning gives "or when prices
  fall between x% and y%". Other cases: "earns most in every cell", "even in today's climate B
  earns more". Near ties never count as a switch.

### 6.5 Sentences

Rule-generated in `sentences.py`, one per block, from the numbers in that report only. They say
"about" and stay cautious, follow `units` ($/ha or $/ac), and the report adds one fixed caveat:
compare rotations rather than reading single numbers, because the model's year-to-year skill is weak.
When the Simulator says the field is not calibrated, the report adds a note that the figures are
rough.

### 6.6 Irrigation

The Simulator's public result gives each season's irrigation as p10 / p50 / p90, not per track, so
this module uses the season's p50 for every track. Rain-fed runs (the Iowa default) are exact.
Irrigated runs add an assumption saying so. Exact per-track irrigation needs one field from andrej
(section 13).

## 7. API

Router prefix `/api/farms/{farm_id}/economics`, tag `economics`.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/defaults` | → `EconomicsDefaults`: every default price, cost, typical yield, rent, irrigation and cover-crop cost with kind and source, in metric plus the source's own units as text (e.g. "$4.60/bu"), and the suggested rotations. For the dashboard's "your numbers" form. |
| POST | `/report` | `EconomicsRequest` → `EconomicsReport` |

`EconomicsRequest`:
- `field_id`
- `rotations`: 1 to 4 `RotationInput` (id, name, crops, cover_crop). The first is "yours". Omitted →
  the Simulator's suggested rotations, reordered so Maize → Soybean is yours, flagged
  `yours_assumed = true`.
- `scenario`: `temp_delta_c`, `rain_change_pct`, `projection`, `irrigation`, `irrigation_cap_mm`,
  `years`, `heat_response`, with the Simulator's limits. Its own schema, not the Simulator's, so the
  contract stays independent.
- `price_change_pct` (−40 to 40, default 0) and optional `price_crop`.
- `your_numbers` (optional): `land` (`rent` | `own`), `rent_usd_ha`, `prices_usd_t` and
  `costs_before_rent_usd_ha` keyed by crop id, `irrigation_usd_per_mm_ha`, `cover_crop_usd_ha`.
  Anything left out uses the default.
- `grid` (optional): `warming_c` (2 to 7 unique values in −1 to 5), `price_change_pct` (2 to 9 unique
  values in −40 to 40).
- `units`: `metric` | `us`.

`EconomicsReport`: `kind = "modelled"`, farm and field ids and names, `area_ha` (Observed, CropTwin),
the scenario echoed (Scenario), `yours_rotation_id`, `yours_assumed`, `climate_bill`, `bad_years` (one
per priced rotation), `who_earns_most` (or null), `inputs_used` (each with value, unit, display text,
kind and source), `excluded_rotations` (id and reason), `assumptions`, `notes`, `calibrated`,
`ensemble_size`, `ensemble_start_years`, `data_note` and `simulator_model_version`. Each block carries
`kind`, `sources` and `sentence`.

Errors: unknown farm or field → 404. Yours has an unpriced crop (winter wheat, sunflower), or the
Simulator rejects a rotation or projection → 422 with a plain message. Weather unavailable → 503,
with the Simulator's wording.

## 8. Module layout

```
backend/app/modules/economics/
├── __init__.py
├── router.py       HTTP only
├── service.py      orchestration; the only file other modules may import
├── schemas.py      API contract, mirrored by frontend/src/modules/economics/types.ts
├── parameters.py   prices, costs, yields, rent and tuning values, each with a source
├── ports.py        the only file that imports app.modules.simulator.service
├── money.py        pure maths: margins, stats, cushions, grid winners
└── sentences.py    rule-generated sentences, units-aware
backend/tests/economics/   test_money.py, test_service.py, test_api.py
frontend/src/modules/economics/types.ts
```

`ports.py` turns Simulator results into plain dataclasses (per rotation: season crops, track
relative yields, season irrigation p50; plus field name, area, current crop, calibrated flag,
ensemble years, data note, model version, projection info) and turns the Simulator's errors into the
module's own `NotFound`, `InvalidRequest` and `WeatherUnavailable`. Tests can swap it for a fake.

## 9. Parameters (copied from the Simulator with the same sources)

| Value | Default | Source |
|---|---|---|
| Maize price | $4.60/bu | WASDE Nov 2026, 2026/27 projected season-average farm price |
| Soybean price | $12.10/bu | same |
| Oats price | $3.35/bu | same |
| Maize typical yield | 211 bu/ac | ISU A1-20 (2026), corn after soybeans |
| Soybean typical yield | 61 bu/ac | ISU A1-20 (2026), soybeans after corn |
| Oats typical yield | 80 bu/ac | ISU A1-20 (2026), oat-companion budget |
| Cash rent | $274/ac | ISU A1-20 (2026) |
| Maize cost before rent | $637.98/ac ($911.98 − $274) | ISU A1-20 (2026), corn after soybeans |
| Maize-after-maize cost before rent | $686.02/ac ($960.02 − $274) | ISU A1-20 (2026), corn after corn |
| Soybean cost before rent | $405.11/ac ($679.11 − $274) | ISU A1-20 (2026), soybeans after corn |
| Oats cost before rent | $191/ac ($465 − $274) | ASSUME, as in the Simulator |
| Irrigation | $0.50 per mm per ha | ASSUME, as in the Simulator |
| Rye cover crop | $35/ac | ASSUME, as in the Simulator |
| `NEAR_TIE_USD_HA` | $45/ha/yr | ASSUME: the Simulator's 0.03 near-tie on its $1,500 margin scale |
| Default "yours" when none given | Maize → Soybean | ASSUME: the usual central-Iowa rotation |
| Bushel weights | maize 56, soybean 60, oats 32 lb | standard, as in the Simulator |

Costs are stored per hectare, and the tests check that cost before rent plus rent equals the ISU
total cost.

## 10. Labels

- Results (blocks 1 to 3): Modelled.
- Every money input (default or the farmer's): Scenario. The source is the USDA or ISU table, the word
  ASSUMPTION, or "Your number". This keeps the three kinds `DESIGN.md` allows.
- Field area: Observed, from CropTwin.
- Owning the land: the margin sentence says it is what's left for land and management.

## 11. Tests

- `test_money.py` (pure): margins, maize-after-maize cost, rent vs own, cover-crop cost, one-crop price
  shift, paired change, cash cushion on a hand-made series, losing shares, grid winner and near tie,
  switch-point cases.
- `test_service.py` (fake port): block assembly, best alternative and win-back share, excluded
  unpriced rotations, 422 when yours is unpriced, defaulted rotations with `yours_assumed`, the
  projection's rain change used for grid rows, the irrigation assumption added only when irrigated.
- `test_api.py` (real Simulator on the seeded demo farm):
  - `/defaults` and `/report` respond.
  - **Consistency**: with default numbers, rain-fed, with and without cover crops, each rotation's
    scenario `annual` p10 / p50 / p90 matches the Simulator's `Economics.margin_per_ha` within
    $3/ha/yr. The tolerance comes from the Simulator rounding `track_seasons` to 0.001 (up to about
    $1.20/ha a season for maize), plus both sides rounding to whole dollars.
  - Report time with the default grid is printed and must be **at most 7 s** (Kiril, 2026-11-15),
    measured after the Simulator has warmed up. If it's slower, make the report faster (for example by
    reusing the today run for a grid row with no warming and no rain change); don't shrink the default grid.
- `frontend`: `npm run build` passes with the new `types.ts`.

## 12. Changes outside the module (tell the team)

- `backend/app/main.py`: one `include_router` line for the economics router.
- `README.md`: Economics in the module table, the dependency diagram, the pages and the layout.
- `frontend/src/app/route.ts` and `App.tsx`: the `economics` route ("Farm money").
- Assistant: `economics` added to its page lists (`backend/app/modules/assistant/schemas.py`, `agent.py`,
  `tools.py`; `frontend/src/shared/assistant/types.ts`, `AssistantProvider.tsx`) so it can open the page.
  The page is only opened, not operated, like the Overview.
- Nothing in `simulator/`, `croptwin/`, `cropdoctor/` or `shared/` (backend).

## 13. Later

- Ideas 4 to 6 from the brainstorm: real historical Iowa prices paired with each weather year (USDA
  NASS, check first), conservation and cover-crop payments, crop insurance.
- From andrej, optional: a per-track irrigation field in `RotationResult` would make irrigated money
  exact (section 6.6).
- Advisor facts for the economics report, like the Simulator's `advisor-context`.
- The dashboard screens (andrej).

## 14. Calls made while writing this up (check these)

These weren't discussed. They're the writer's calls:

1. Default "yours" is Maize → Soybean, not the Simulator's first suggestion (continuous maize).
2. Grid rows use uniform warming with the scenario's rain change; a projection scenario uses its May-Sep
   median rain change.
3. Near tie at $45/ha/yr, derived from the Simulator's own near-tie rule.
4. Switch points are reported between grid rows ("between +1 and +2 °C"), not interpolated, to
   avoid false precision.
5. Bad-year money counts seasons, not calendar years, and also reports losing runs out of 25.
6. Irrigated runs use each season's p50 irrigation for every track (section 6.6).
7. `/defaults` also exists, so the dashboard can fill the "your numbers" form.

## 15. Build notes (2026-11-15)

Run it, with the API on port 8000:

```bash
curl http://localhost:8000/api/farms/demo/economics/defaults
curl -X POST http://localhost:8000/api/farms/demo/economics/report \
     -H 'Content-Type: application/json' -d '{"field_id":"north"}'
```

What changed from the plan while building:

- **Runs are cached by scenario** inside one report, so today's run doubles as the grid's 0 °C row (when
  the grid's rain change is 0) and a slider scenario that sits on the grid reuses its row. The default
  report makes 6 Simulator calls, not 8.
- **`your_cell.exact` is always false for a NASA projection**, even if its median warming lands on a grid
  value: a grid row is a uniform shift, a projection is month by month.
- **The farmer's maize cost** keeps ISU's corn-after-corn premium on top for maize after maize; the input
  list says so.
- **Assumptions for an input the farmer replaced are dropped** (oats cost, irrigation cost, cover-crop
  cost): the ASSUME value isn't used then.
- **"Loses money in every simulated season"** replaces "about 10 of every 10 seasons".
- **The screen** (`frontend/src/modules/economics/`): field, rotations (pick yours, add rye), climate
  (NASA projection or sliders, heat response), all-crop price change, rent or own, and the farmer's own
  prices and costs in $/bu and $/ac (US units) or $/t and $/ha (metric). Results: the climate bill,
  bad-year money, the who-earns-most grid (cells name the winner, so colour is never the only signal; your
  cell outlined), and every number used with its source. It reads fields and projections from
  `simulatorApi.getOptions` and the rotation colours from the Simulator's `rotationColors`. English and
  Macedonian: page strings in `frontend/src/shared/i18n/mk/economics.ts`, the backend's sentences in
  `economics/i18n_mk.py` (registered in `main.py`; `tests/economics/test_i18n_mk.py` fails on English left
  in a Macedonian report). The source value `"Your number"` stays English in the API because the page
  compares it; the page translates it where it's shown. Translations are the developer's, like the rest
  of the site: have a native speaker review them (`docs/i18n.md`).
- With the demo field and the default NASA 2050s middle-emissions projection, Maize → Soybean's margin
  falls from about $86/ha to about −$467/ha a year under the US-research heat response, and by about
  $132/ha with this county's heat response. The gap between those two is the model's main uncertainty;
  the page shows both.

