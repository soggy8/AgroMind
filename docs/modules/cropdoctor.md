# CropDoctor: design

Status: **built, 2026-11-14.** The Command Center runs on real data for the demo farm, with the
West Field finding. **Not built:** the Landsat picture inside each field, SMAP soil moisture, and
greenness for farms other than the demo farm. The advisor is only a "Work in progress" button
(see "Still to do").
Scope notes for the module are in `backend/app/modules/cropdoctor/README.md`.

Decisions marked **(Kiril)** were made by Kiril. Decisions marked **(call)** were made while
writing this and can be overruled.

---

## 1. What this is for

CropDoctor answers "what is happening on my farm now?". The first version makes the Command
Center sketch (`docs/design/command-center-sketch.html`, `DESIGN.md` sections 5 to 9) work on
real NASA data for the demo farm, and carries one real finding the whole way: observation,
anomaly against the field's own normal, a cautious possible explanation, a recommended check.

It is for the Space Apps judges this weekend, and after that for a farmer deciding whether a
field needs a visit. What makes it worth showing is that it never claims more than a satellite
can know.

## 2. Goals, non-goals, anti-goals

**Goals**

1. `GET /api/farms/{farm_id}/health` returns, for each field, labelled indicators, the season's
   greenness against normal, and any findings. Every number carries its kind and source.
2. The Command Center shows it for the three demo fields: map, field list, indicator rows,
   8-day strip, season chart, finding block.
3. The demo opens on a real past date where the data shows stress, labelled as a replay, and can
   switch to today. **(Kiril)**
4. The demo farm works with no network, from committed sample files. **(call)**

**Non-goals this weekend**

- SMAP soil moisture, GPM rainfall, Meteomatics. **(Kiril)**
- Landsat 30 m picture inside each field: only if everything else is done. **(Kiril)**
- Rainfall and Heat map layers (weather is one value for the whole farm). **(Kiril)**
- Greenness for farms other than the demo farm. They get weather indicators and a plain
  "greenness isn't available for this farm yet" message. **(call)**
- Database tables, an LLM advisor, notifications, forecasts, the tablet rail and the draggable
  phone sheet from `DESIGN.md`. **(call)**

**Anti-goals: these make it a failure even if it runs**

- Tuning a threshold until the demo shows a finding. If the rule does not fire on the real
  field values, stop and report it.
- A number without a kind and a source, or a placeholder number from the sketch.
- Wording that reads as a diagnosis: "disease detected", "caused by", "stress confirmed".
- A crop label that is wrong for the year being shown.

## 3. Constraints

- Stay inside `backend/app/modules/cropdoctor/`, `backend/tests/cropdoctor/`,
  `frontend/src/modules/cropdoctor/`, `docs/modules/cropdoctor*`. Exceptions are listed in
  section 10.
- Read the farm only through `croptwin.service`. Never import the Simulator.
- `shared/connectors` is a teammate's and is empty, so data comes through CropDoctor's own
  `ports.py`. **(Kiril)**
- `schemas.py` and the frontend `types.ts` are one contract; change both in the same commit.
- Thresholds live in `parameters.py`, each marked ASSUME with its reason, and are returned by
  the API so the screen can list them.
- A teammate develops on Windows: no `strftime("%-d")`; `.py` files are LF.
- No Earthdata login is available.
- Demo-ready this weekend. **(Kiril)**

## 4. Approaches considered

| | How it works | Trade-off |
|---|---|---|
| **A. Samples first (chosen)** | A one-off script pulls real MODIS greenness and the USDA crop map for the demo fields into committed files. Pure rules compute normals, anomalies and findings from those files on each request. The network is only used to refresh "today". | The demo cannot be broken by an outage. Costs one script and a few hundred kB of committed data. Same shape as the Simulator. |
| B. Live first | Every request fetches from Planetary Computer and NASA POWER, with a cache. | No committed data, but the demo depends on two services. NASA's own MODIS service was returning 503 on the day this was written. |
| C. Precomputed answer | A script writes the finished health payload for one date; the API serves the file. | Fastest to build, but no date picker, no "today", and the rules would live in a script nobody tests. |

Kiril handed this choice over; A is the pick. **(call)**

## 5. What the real data says

Read on 2026-11-14 from Planetary Computer and the committed POWER sample. Greenness values are
the **centre pixel** of each demo field; the build uses a field mean, so these will move a little.

- **Crops.** USDA's Cropland Data Layer has North and Creek rotating corn and soybeans (2012:
  North soybeans, Creek corn) and West as grass or pasture every year 2010 to 2021. The CropTwin
  seed says maize, soybean and oats.
- **2012 drought.** Creek (corn) was 11% below normal in the period 19 Jul to 3 Aug (0.80 against
  0.90, lower than all 10 previous years), then 9% and 12% below. West (pasture) was 9% to 12%
  below for five periods. North (soybeans) stayed at or above normal all summer.
  *Note, 2026-11-14:* on field means (5 points) the rule gives West Field a Watch from 11 Jul 2012
  (three low periods, -6% to -8%). Creek has one low period (19 Jul, -9.9%); its 27 Jul period
  (-6.6%) is not low because 2002 and 2004 were lower. Kiril chose to keep the rule and thresholds
  and show the West finding; no threshold was changed. On field means USDA's crop map puts West as
  corn or soybeans in several years (2012: 3 of 5 points corn, centre pixel pasture), so the screen
  labels it "Mixed" where the points disagree.
- **Result on the demo date, 12 Aug 2012 (field means, from the API).** Period 27 Jul to 11 Aug.

  | Field | Crop label | Greenness | Normal (10 years) | Difference | Status |
  |---|---|---|---|---|---|
  | North | Mixed: Soybeans and Corn | 0.8767 | 0.87 | +0.8% | normal |
  | Creek | Corn | 0.8136 | 0.8715 | -6.6% | normal |
  | West | Mixed: Corn and Grassland/Pasture | 0.7562 | 0.8249 | -8.3% | watch since 11 Jul 2012 |

  Weather, 14 Jul to 12 Aug (one value for the farm):

  | Value | Kind | Result | Normal | Difference |
  |---|---|---|---|---|
  | Rainfall, 30 days | Observed | 54.32 mm | 119.25 mm | -54.4% |
  | Daily high, 30-day mean | Observed | 35.05 °C | 29.88 °C | +5.2 °C |
  | Water demand (ET0) | Modelled | 6.41 mm/day | 4.96 mm/day | +29.4% |

  The one finding is West Field, Watch, "Possible water stress": "Water stress may be one
  explanation", with the check "Dig to 15 cm in a few places across the field and feel whether the
  soil is dry." Creek is not flagged: its 27 Jul period is not low because two earlier years
  were lower. Kiril kept the rule and thresholds; nothing was tuned.
- **Crop labels.** Where the USDA crop-map points disagree the label reads "Mixed: A and B". Creek
  is unanimous every year. North splits 3 to 2 between corn and soybeans every year. West mixes
  pasture with corn and soybeans.
- **Weather then.** 30 days to 12 Aug 2012: 54 mm of rain against 119 mm (54% short, one of the
  previous 10 years drier), highs averaging 35.1 °C (5.2 °C above normal).
- **Other years.** Aug 2020: Creek 40% below, North 22% below. Jun 2013: all three fields 35% to
  56% below after the wettest, coldest spring of the previous 10 years.
- **Rotation effect.** The 10-year normal mixes corn and soybean years, and soybeans green up
  later, so a soybean year looks low in June. From July the crops converge (normal 0.87 to 0.90),
  which is why findings are only raised at full canopy.
- **How often the rule fires.** On 42 field-summers (2012 to 2025) the rule in section 6 raises a
  finding in about 9: roughly one summer in five per field.

## 6. How it works

### Data

| What | Source | Kind shown |
|---|---|---|
| Greenness (NDVI), 16-day periods starting every 8 days, 250 m | MODIS MOD13Q1 + MYD13Q1 v6.1 (NASA LP DAAC), read from Microsoft Planetary Computer **(Kiril)** | Observed |
| 30-day rainfall, mean daily high | NASA POWER daily, as the Simulator uses | Observed |
| Water demand (reference ET0) | FAO-56 Penman-Monteith, computed here from the POWER weather | Modelled **(Kiril)** |
| Soil texture, pH | CropTwin field profile (SoilGrids) | Modelled |
| Crop in a past year | USDA Cropland Data Layer, 2008 to 2021, from Planetary Computer | Modelled **(call)** |

- Planetary Computer needs no login. Its point endpoint returns pixel values as JSON, so `httpx`
  is enough and `rasterio` is not needed:
  `GET /api/data/v1/item/point/{lon},{lat}?collection=modis-13Q1-061&item={id}&assets=250m_16_days_NDVI&assets=250m_16_days_pixel_reliability`.
  NDVI is the value times 0.0001. Reliability 0 is good, 1 marginal; anything else is dropped.
- A period is identified by the day-of-year in the item id (`MOD13Q1.A2012193` is 193). The same
  number is the same period in every year; do not adjust for leap years.
- **Field value (call):** the mean over sample points on a regular grid inside the boundary,
  inset from the edge so neighbours' pixels stay out. Record how many points were usable.
- **Committed samples (call):** `python -m app.modules.cropdoctor.fetch_samples` writes the demo
  fields' greenness history, their USDA crop per year, and POWER weather for 2026, into
  `data/samples/`, each with a header naming source and retrieval date. The existing POWER sample
  (2001 to 2025) is read as it is and not modified.
- The water-demand label is "Water demand (ET0)", not "Water use": reference ET is what the air
  asks of a reference crop, not what this crop used. **(call)**

### Time

- Every request has an `as_of` date. Only satellite periods that had **ended** by that date are
  used, and weather up to that date. **(call)**
- The current period is the latest ended one with usable pixels. If a later ended period had
  none, the screen says "No clear image since" with that date. **(call)**
- **Normal** is the mean of the 10 years before the `as_of` year, same period or same 30-day
  window. **(Kiril)** At least 7 of those years must have data, otherwise the value is shown
  without a comparison. **(call)**
- **Default date: 12 August 2012. (call, Kiril said "just pick one year")**
  The date was picked from the centre-pixel reading of Creek. On field means the finding is on
  West Field, not Creek, and its Watch is since 11 Jul 2012 (two low periods had both ended by
  4 Aug). 12 August is kept as the demo date because by then the 30-day weather shows the drought.
- "Today" uses the samples plus a refresh from POWER and Planetary Computer, cached under
  `data/cache/`. The refresh runs only for the demo farm, only when the date asked for is more than
  16 days past the saved data, and at most once an hour. If it fails the screen says "Couldn't
  reach NASA data. Showing saved data to …" with the date the saved data runs to. The API returns
  that date as `data_through`; it is null for farms other than the demo farm.

### Finding rule **(Kiril)**

1. A field is checked only in periods where its normal greenness is 0.75 or more (full canopy;
   about late June to late August for these fields). Outside that the status is "paused".
2. A period is **low** when greenness is at least 5% below normal **and** at most one of the
   previous 10 years was lower.
3. Two low periods in a row raise a finding. **Alert** if any of them is at least 20% below
   normal, otherwise **Watch**. "Since" is the start of the first low period.
4. A period with no usable pixels neither breaks nor extends a run. **(call)**

### Possible explanations **(Kiril)**

| When | Text | Recommended check |
|---|---|---|
| Greenness fell by 0.15 or more against the period 16 days earlier | "A sudden event such as a storm, hail or cutting may be one explanation." | Walk the field and look for flattened, torn or cut plants. |
| 30-day rainfall is among the two driest of the previous 10 years | "Water stress may be one explanation." Adds the heat figure when highs are 2 °C or more above normal. | Dig to 15 cm in a few places across the field and feel whether the soil is dry. |
| Neither | "The weather doesn't explain this." | Walk the field and look closely at leaves and roots; a local agronomist can tell pests, disease and nutrient problems apart. |

- A finding can carry the first two together. **(call)**
- Every finding ends with "Satellites can't rule out pests or disease."
- Checks are field-level. The sketch's "north-east corner" needs sharper data than 250 m pixels.
- The 0.15 fall, the 2 °C and the trigger wording details are **(call)**, marked ASSUME.
- The check texts are general field practice, not taken from a cited source, and the screen does
  not present them as cited.

### API

| Method | Path | Response |
|---|---|---|
| GET | `/api/farms/{farm_id}/health?as_of=YYYY-MM-DD` | `FarmHealth` |
| GET | `/api/farms/{farm_id}/health/advisor-context?as_of=YYYY-MM-DD` | `AdvisorContext` (instructions, facts, suggested questions) |

Without `as_of` the demo farm answers for the default replay date; other farms answer for today.
A farm counts as the demo farm when its fields are in the committed greenness sample. **(call)**

`FarmHealth` carries: the farm, `as_of`, `today`, whether this is a replay, a data note, the
fields, the findings, the assumptions and the sources. Each field carries its boundary, crop
label (with year, kind and source), status (`normal`, `watch`, `alert`, `paused`, `no_data`), the
indicator values, the season series (this year, the two before, and the normal as mean with
lowest and highest) and the per-period difference from normal. Each value carries `value`,
`unit`, `kind`, `source`, the date or period it covers, and where there is one the normal, the
difference and how many years the normal used. Each finding carries the field, severity,
headline, since-date, the values it rests on, and its explanations with their checks.

Errors: 404 unknown farm, 422 bad date, 503 when a live refresh is needed and fails with nothing
saved to fall back on.

### Backend layout

Keeps the scaffold's files and adds four.

```
backend/app/modules/cropdoctor/
├── router.py            HTTP only
├── service.py           orchestration; the only file other modules may import
├── schemas.py           API contract, mirrored by frontend/src/modules/cropdoctor/types.ts
├── parameters.py        new: every threshold, marked ASSUME with its reason
├── ports.py             new: CropTwin, sample files, POWER and Planetary Computer fetches
├── fetch_samples.py     new: CLI that writes the committed samples
├── advisor.py           new: fact list for the advisor drawer
├── indicators/
│   ├── vegetation.py    field greenness series, current period for a date
│   ├── weather.py       30-day rain, mean daily high, reference ET0
│   └── soil_moisture.py left empty with a note: needs SMAP and an Earthdata login
├── baselines.py         the previous-10-years normal
├── anomalies.py         difference from normal, rank among earlier years, low periods, runs
└── explanations.py      findings: severity, explanations, checks
```

`indicators/`, `baselines.py`, `anomalies.py` and `explanations.py` are pure: plain data in,
plain data out, no FastAPI, pydantic, database or network. **(call)**

### Screen **(Kiril: match the Simulator)**

- `CommandCenterPage` in `frontend/src/modules/cropdoctor/pages/`, using the same shell as
  `SimulatorPage`: top bar, floating panels over the map at 1024 px and wider, and below that the
  map on top with a glass section and tabs (`Fields`, `Status`).
- Left panel: field rows; the selected field's indicator rows and 8-day strip. The strip is
  labelled "8-day steps", not "weekly". **(call)**
- Right panel: finding block or "All fields within normal range" or "Stress checks are paused",
  then the season chart, the data note, and "How this was worked out" listing the assumptions.
- Map: Satellite and Greenness layers. Greenness fills each field with its NDVI colour and shows
  the key and the source pill with the period dates.
- Date control with two quick choices, the 2012 replay and Today. A replay is always labelled
  with its date. **(call)**
- In a replay the crop label is USDA's for that year ("Corn (2012)"), tagged Modelled; today it is
  the farm profile's. **(call)**
- "Ask the advisor" opens a dialog like the Simulator's drawer. **Built reduced (Kiril):** the
  button and a dialog that says "Work in progress" and "The AI advisor isn't built yet." The fact
  list and the endpoint are not built; the API table row above is the planned design.
- Every state in `DESIGN.md` section 9 is handled.
- Shared pieces `DESIGN.md` names that do not exist yet get built to its spec: `IndicatorRow`,
  `FieldRow`, `Badge`, `SeasonChart`, `WeeklyStrip`, `NdviKey`.

## 7. Tests

- Pure rules, with hand-built series: one low period raises nothing; two raise Watch; 20% raises
  Alert; the canopy gate; a period that has not ended is invisible; fewer than 7 normal years
  gives no comparison; a gap neither breaks nor extends a run; each explanation's trigger.
- Reference ET0 against a worked example in FAO-56, with the example cited in the test.
- API, on the seeded demo farm: the default date returns the Creek Field finding; every value has
  a kind and a source; today returns "paused"; unknown farm is 404. Tests never use the network.
- One Playwright smoke test, desktop and phone: the default view shows the finding, Today shows
  paused, and the phone layout has no horizontal scroll.
- Checks: `cd backend && .venv/bin/python -m pytest`; `cd frontend && npm run build`.

## 8. Build order

1. `fetch_samples.py` and the committed samples. This confirms or refutes the August 2012 finding
   on field means before anything else is built.
2. Pure rules and their tests.
3. Service, API and API tests; mount the router.
4. The screen on desktop.
5. Phone layout and the smoke test.
6. Advisor facts and drawer.
7. Refresh for "today".
8. If time remains: Landsat picture inside the field.

## 9. Left to the builder

- Exact field names in `schemas.py`, as long as the contents in section 6 are there.
- How many sample points per field (5 to 9) and the inset.
- File names and column layout of the samples.
- Whether the advisor drawer is a shared presentational component or lives in the module.
- Component breakdown and state handling inside the page.

## 10. What touches other people's files, and what to tell them

Edits outside CropDoctor's folders, each small:

- `backend/app/main.py`: mount the router (the file has a comment marking the spot).
- `frontend/src/app/App.tsx`: render the page for the `command-center` route.
- `frontend/src/shared/map/FarmMap.tsx`: an optional fill colour per field; the Simulator's use
  is unchanged.
- `frontend/src/shared/components/` and `shared/charts/`: the six components named above.
- `docs/data-sources.md`: a "Used by CropDoctor" section, as the Simulator has.
- `CLAUDE.md`: a "Working on CropDoctor" section.

To pass on:

- **CropTwin seed (Andrej):** USDA has West Field as pasture, not oats, and North and Creek
  rotating corn and soybeans. Crop history for 2008 to 2021 could be seeded from the same source.
- **CropTwin field outlines (Andrej):** the outlines for North and West seem to cover more than one
  real field. The USDA points inside North split 3 to 2 between corn and soybeans every year (the
  west strip has the opposite rotation), and West mixes pasture with corn and soybeans. Creek is
  unanimous every year. CropDoctor shows "Mixed: A and B" for these fields. Redrawing the outlines
  to match real fields would give clean crop labels and sharper greenness.
- **CropTwin seed (Andrej):** the seed has no `soil_texture`, so CropDoctor shows pH and clay only.
  The Simulator derives the texture from sand and clay.
- **Simulator (Andrej):** reference ET0 now exists in both modules, because they may not import
  each other. Moving it to `shared/` would remove the copy. The same goes for `useMedia`.
- **Connectors owner:** CropDoctor's `ports.py` will hold working fetchers for Planetary Computer
  and POWER that can move into `shared/connectors`. `docs/data-sources.md` says MODIS and Landsat
  need an Earthdata login; through Planetary Computer they do not.

## 11. Run it

From the repo root, with the backend and frontend set up as in `README.md`:

```bash
cd backend
.venv/bin/alembic upgrade head
.venv/bin/python -m app.modules.croptwin.seed            # demo farm
.venv/bin/python -m app.modules.cropdoctor.fetch_samples # only to rebuild or extend the samples
.venv/bin/uvicorn app.main:app --port 8000
cd ../frontend && npm run dev                            # http://localhost:5173, proxies /api
cd frontend && npx playwright test                       # needs the API and the dev server running
cd backend && .venv/bin/python -m pytest -q
```

Open the Command Center. It starts on the 2012 replay. `GET /api/farms/demo/health?as_of=2012-08-12`
gives the same data as JSON.

`fetch_samples` needs the network and writes `data/samples/modis_ndvi_demo_fields.csv`,
`usda_cdl_demo_fields.csv` and `power_daily_story_county_ia_2026.csv`. Tests never use the network,
but a few use today's real date. Once the committed samples are more than 16 days old those tests
would trigger a refresh. Rerun `fetch_samples` or patch the fetchers in them.

## 12. Still to do

- The full advisor: `advisor.py` fact list, the `advisor-context` endpoint, and the drawer content.
- Soil texture: empty in CropDoctor because the CropTwin seed has no `soil_texture`. Derive it from
  sand and clay as the Simulator does, or have CropTwin seed it.
- The Landsat 30 m picture inside each field (needs its own short plan).
- SMAP soil moisture (needs an Earthdata login).
- Connectors moving from CropDoctor's `ports.py` to `shared/connectors`.
- Greenness for farms other than the demo farm.
- `useMedia` and ET0 copies moving to `shared/`.
- On a phone the map shows no greenness values; they are in the Fields tab.

## 13. Open assumption

Judges see a video or slides and the repo, so the demo runs on a laptop and needs no public link.
If a live link is required, hosting becomes a team task and the "today" refresh has to work on a
server. **(call, not confirmed)**
