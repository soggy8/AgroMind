# CropTwin handoff guide

For teammates and AI agents merging or continuing the CropTwin work. It covers what was added, how it works, why,
and what not to break. The detailed record (assumptions, NASA layer table, test record) stays in
[croptwin.md](croptwin.md); this guide points into it rather than repeating it. Everything below was checked
against the code on 2026-11-14.

## 1. Overview

CropTwin answers *What is my farm?* It is the farm profile: farms, fields (drawn boundaries), area, current and past
crops, soil layers, irrigation, priorities and constraints. Other modules read it only through
`backend/app/modules/croptwin/service.py`. Today the Simulator does this in `simulator/ports.py`.

The work added:
- several farms, each with an optional map point
- a no-overlap rule between fields
- SoilGrids soil prefill (from a committed sample)
- NASA GIBS map layers, with a per-field value readout
- NASA POWER recent weather
- place search (OpenStreetMap Nominatim, through our backend)
- country borders and place names
- "Locate me"
- data dates everywhere

Most of the map code lives in `frontend/src/shared/map/` so other modules can reuse it. That folder is shared code
that CropTwin added to, not CropTwin-owned code. The page is `frontend/src/modules/croptwin/pages/FarmProfilePage.tsx`,
at route `farm-profile`.

## 2. Feature tour

Each feature lists what the user sees, the files, how it works, and why.

### Farms and fields
- **What the user sees:**
  - a farm picker in the left panel, with **New farm** and **Delete farm**
  - a fields list and a field editor in the right panel
  - one primary button, **Save farm**
- **Files:**
  - `components/FarmPanel.tsx`, `FarmPicker.tsx`, `NewFarmPanel.tsx`, `FieldPanel.tsx`
  - `state/useFarms.ts`, `state/useFarmProfile.ts`, `lib/draft.ts`
  - backend `service.py` (`create_farm`, `update_farm`, `delete_farm`, `create_field`, `update_field`, `delete_field`)
- **How:**
  - Edits are drafts. **Save farm** sends farm changes first, then each changed field (`lib/draft.ts` `changesFor`).
  - `isDirty` drives the leave-without-saving guard in `FarmProfilePage`.
  - `useFarms` remembers the open farm in `localStorage` under `agromind.croptwin.farm`.
  - `FarmProfile` is keyed by farm id, so switching farms starts from a clean state.
  - Deletes ask first through `components/ConfirmDialog.tsx` (`useConfirm`). The farm delete dialog says the
    Simulator's saved runs go too.
- **Why:** `window.confirm` blocks the page and can't be styled, so deletes use an in-app dialog.

### Boundary drawing and the overlap rule
- **What the user sees:**
  - click to add corners, drag to move them, and type corners in the field editor
  - warnings when edges cross or when the outline overlaps another field
  - the overlapped field is outlined in the alert colour, and **Save farm** is blocked
- **Files:**
  - `shared/map/BoundaryDraw.tsx` (`BoundaryDraw`, `selfIntersects`, `overlaps`)
  - backend `geometry.py` (`_self_intersects`, `overlaps`, `outer_ring`, `area_ha`, `centroid`)
  - `service.py` `_check_overlap`
- **How:**
  - Fields may share an edge or a corner (a fence line) but not area. Arithmetic is exact, with no tolerance.
  - The API answers 409 on create, or on update when the boundary changes. `_check_overlap` runs before anything is
    modified.
  - The UI runs a copy of the same test while you draw (`lib/draft.ts` `overlappingFields`, `boundaryIsNew`).
  - Area is computed with a local equirectangular projection (`geometry.area_ha`), unless the farmer types an area.
- **Why:** two fields covering the same ground would be counted twice by the Simulator.
- **Keep the TS and Python copies identical.**

### Soil: SoilGrids prefill and lab layers
- **What the user sees:** a soil table. **Prefill from SoilGrids** replaces the layers after a confirmation, and
  **Add a lab layer** adds one.
- **Files:**
  - `components/SoilTable.tsx`
  - backend `soil_source.py` (`soilgrids_profile`) and `service.py` (`prefill_soil_from_soilgrids`, `replace_soil_layers`)
  - `data/samples/soilgrids_story_county_ia.json` (the sample, `soil_source.SAMPLE`)
- **How:**
  - Prefill saves immediately, and lab layers are saved with **Save farm**.
  - There is no live SoilGrids connector yet. The sample covers fields within 5 km of 42.03 N, 93.46 W
    (`SAMPLE_RADIUS_KM`). Beyond that the API answers 503 with a next step.
  - SoilGrids layers are labelled MODELLED. Farmer and lab layers are OBSERVED, with source `"Farmer-provided"`
    (`draft.ts` `soilKind`, `FARMER_SOURCE`).
- **Why:** the Simulator only uses layers that have both sand % and clay % (`simulator/ports.py` `_soil_from_layers`),
  so the form says so.

### Crop history
- **What the user sees:** past seasons, each with a crop and an optional yield, plus add and delete.
- **Files:**
  - `components/CropHistoryList.tsx`
  - `service.py` `add_crop_history`, `delete_crop_history`
- **How:**
  - Changes save immediately, so the field must already be saved.
  - The same crop and year twice gives 409.
  - Yields are only what the farmer typed (OBSERVED). Nothing is estimated.
  - Crops are limited to the five the Simulator models.

### Priorities and constraints
- **What the user sees:** four weight levels (Off 0, Low 1, Med 2, High 3) for yield, water, risk and soil, plus
  free-text constraints, in `FarmPanel.tsx`.
- **How:** they are stored as `farms.priorities` (JSON, `schemas.FarmPriorities`, which also has `margin`).
  `simulator/ports.py` passes `farm.priorities.model_dump(by_alias=True)` to the Simulator.

### Start location and Locate me
- **What the user sees:**
  - A farm with fields fits its fields. A farm with only a point centres on it.
  - Otherwise a card asks "Start the map where you are?".
  - A **Locate me** button sits under the zoom buttons.
- **Files:**
  - `shared/map/geolocation.ts` (`requestLocation`), `LocateControl.tsx`
  - `MapFocus.tsx` (`MapFocus`, `PointMarker`, `MapClick`)
- **How:**
  - The page calls `requestLocation()` once per request.
  - `MapFocus` moves the map only when `target.key` changes (`focusOn` and `focusBounds` in `FarmProfilePage.tsx`),
    so re-renders never move it.
- **Why:** privacy. The location stays in memory and is never sent or stored. The one exception is "Use my location"
  for a new farm, which saves that point as the farm's.

### Search
- **What the user sees:** one search box on the map. Farms and fields match as you type, and typed coordinates jump
  straight there. Place names are looked up on **Enter** only.
- **Files:**
  - `shared/map/MapSearch.tsx` (`MapSearch`, `parseCoordinates`)
  - `FarmProfilePage.tsx` `searchPlaces`, `api/croptwinApi.ts` `searchPlaces`
  - backend `places.py` (`search`, `_wait_turn`) and the route `GET /api/farms/places`
- **How:**
  - The backend proxies Nominatim at 1 request per second at most, server-wide.
  - It sends an identifying User-Agent and the browser language, and caches results in memory.
  - Results show the attribution.
- **Why:** Nominatim's usage policy requires all of this. Section 3 has the details.
- **Bug fixed this session:** the old `FitFields` pan effect in `FarmMap.tsx` depended on the `fields` array. That
  array is new on every render, so the map snapped back right after a search. See section 6.

### Borders and place names
- **What the user sees:** borders and labels over the imagery, with a toggle in the NASA data panel.
- **Files:** `shared/map/ReferenceLayers.tsx` (`ReferenceLayers`, `REFERENCE_ATTRIBUTION`).
- **Why Esri:** on 2026-11-14, NASA GIBS `Reference_Features_15m` and `Reference_Labels_15m` returned opaque all-black
  placeholder tiles. Esri World Boundaries and Places is on the same server and licence as the basemap.

### NASA layers and the value readout
- **What the user sees:**
  - a **NASA data** control with 11 datasets (`nasaLayers.ts` `NASA_LAYERS`: 10 GIBS layers plus an ECOSTRESS link)
  - a date picker, a legend, the kind, and the pixel size
  - Worldview and Earthdata links
  - with a field selected, "value at <field>"
- **Files:**
  - `shared/map/NasaLayerControl.tsx`, `nasaLayers.ts`
  - `gibs.ts` (`availableDates`, `tileUrl`, `nearestDate`, `previousDate`, `firstDate`, `lastDate`, `periodText`,
    `worldviewUrl`)
  - `pixelSample.ts` (`samplePixel`, `tilePixel`)
  - `FarmProfilePage.tsx` `readNasaValue`
  - backend `colour_classes.py` (`colour_map`, `parse`, `classify`) and `GET /api/farms/nasa-colour`
- **How:**
  1. Dates come live from GIBS DescribeDomains, never after today (UTC).
  2. The browser reads the exact pixel colour at the layer's native zoom.
  3. The backend looks that RGB up in NASA's colour map XML and returns NASA's own class range. There is no
     interpolation and no nearest-colour guess.
- **Why:** these are map images, so the honest number is NASA's class, labelled as a pixel class, not a measurement.
  The layer table is in `croptwin.md`, under "NASA layers".

### POWER weather
- **What the user sees:** a weather card in the field panel showing 30 days of precipitation, max and min
  temperature and solar radiation, labelled MODELLED.
- **Files:**
  - `components/WeatherCard.tsx`
  - backend `weather_source.py` (`recent_weather`, `_fetch`, `_parse`), `service.field_weather`
  - route `GET …/weather`
- **How:**
  - The backend calls the POWER Daily API with `community=AG` and caches responses for 6 hours.
  - The fill value -999 becomes "no value".
  - Units and names come from POWER. The 30-day totals are computed in the card and labelled as such.

### Data dates
- **What the user sees:** every piece of data shows how fresh it is:
  - NASA layer date and publishing period
  - imagery capture date
  - farm and field saved times
  - soil retrieved or entered dates
  - the weather period
- **Files:**
  - `shared/map/dates.ts` (`formatDay`, `formatDayWithAge`, `formatTimestamp`, `formatTimestampWithAge`)
  - `ImageryDate.tsx` (`imageryCapture`, `ImageryDateWatcher`)
  - backend `schemas.UtcDatetime`
- **How:** provider days are UTC calendar days, and our own timestamps are shown in local time.
- **Why `UtcDatetime`:** SQLite returns naive datetimes, which a browser would otherwise read as local time.

### "Nothing drawn here"
- **What the user sees:** "Nothing drawn at <field> on <date>" with the reason, a **Find the latest date with data
  here** button, and **Zoom to <field>** for field-scale layers.
- **Files:**
  - `NasaLayerControl.tsx` (`findLatestHere`, at most 20 dates)
  - `pixelSample.ts`
  - `FarmProfilePage.tsx` `ZoomToSelected`
- **Why:** daily swath and field-scale layers are often transparent over the farm on the latest date. NASA still
  answers HTTP 200, so the layer looked "not loading".

## 3. Data sources

| Provider | Endpoint | Key and terms | Kind, and why | Cache and rate limit |
|---|---|---|---|---|
| NASA GIBS tiles | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{id}/default/{date}/{tms}/{z}/{y}/{x}.png` (`gibs.ts` `tileUrl`) | No key. Tiles send `Access-Control-Allow-Origin: *`. NASA's terms not re-checked in this session. | Per layer, Observed or Modelled, from NASA's product description (`nasaLayers.ts`) | Browser HTTP cache only |
| NASA GIBS dates | `…/best/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains…` (`gibs.ts` `availableDates`) | No key, CORS allowed | (metadata) | Cached per page load |
| NASA GIBS colour maps | `https://gibs.earthdata.nasa.gov/colormaps/v1.3/<name>.xml` (`colour_classes.COLORMAPS`) | No key | Used to name a pixel's class | Cached in memory for the life of the backend process (`colour_classes._cache`) |
| NASA GIBS legends | `https://gibs.earthdata.nasa.gov/legends/<x>_H.svg` (`nasaLayers.ts` `LEGENDS`) | No key | (legend image) | Browser |
| NASA POWER Daily | `https://power.larc.nasa.gov/api/temporal/daily/point` (`weather_source.POWER_DAILY`) | No key: the API's OpenAPI document "declares no authentication" (`weather_source.py` header) | Modelled. POWER calls it "Analysis Ready Data", and the response lists sources (GEOSIT, FLASHFLUX, POWER) | 6 h per rounded point and date range, at most 128 entries (`CACHE_SECONDS`, `CACHE_SIZE`) |
| OpenStreetMap Nominatim | `https://nominatim.openstreetmap.org/search` (`places.NOMINATIM_SEARCH`) | No key. Policy: "an absolute maximum of 1 request per second"; identify the application (User-Agent `AgroMind/0.1 (NASA Space Apps farm digital twin; CropTwin place search)`); display attribution; no auto-complete. Chosen by the project owner on 2026-11-14. | (place names, not data) | 1 request per second server-wide (`_wait_turn`), in-memory LRU of 256 queries (`CACHE_SIZE`), Enter only |
| Esri World Imagery | `server.arcgisonline.com/…/World_Imagery/MapServer` (basemap, in `FarmMap.tsx`) | No key. Esri Master License Agreement. | Observed imagery | Browser |
| Esri World Imagery Citations | `…/World_Imagery/MapServer/4/query` (`ImageryDate.tsx` `CITATIONS`) | Same service and licence as the imagery | Capture date of the imagery | At most once every 2 s, after the map stops moving. Only the map centre is sent. |
| Esri World Boundaries and Places | `…/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}` (`ReferenceLayers.tsx`) | No key. Same licence; "designed for use with … World Imagery". No offline export. | (reference labels) | Browser |
| ISRIC SoilGrids v2.0 | none yet: committed sample `data/samples/soilgrids_story_county_ia.json` (`soil_source.SAMPLE`) | Citation is the sample's `_source` text. Licence not re-checked here. | Modelled: mapped predictions at about 250 m | Read from disk; 5 km radius |
| Browser Geolocation API | browser only (`geolocation.ts`) | User permission prompt | The user's own position | Never stored or sent |

## 4. API routes

All routes live in `backend/app/modules/croptwin/router.py`, under the prefix `/api/farms`. Errors from `service.py`
are mapped in `router._call`:
- `NotFound` → 404
- `Conflict` → 409
- `InvalidBoundary` → 422
- `SoilDataUnavailable` → 503

Pydantic validation errors are also 422. Bodies are the models in `schemas.py`.

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/farms` | none | `FarmSummary[]` (id, name, region, field_count) | none |
| GET | `/api/farms/places` | query `q` (2–200 chars), `lang` (optional BCP 47 tag) | `PlaceSearch` {results: `PlaceOut[]`, attribution} | 422 bad query; 429 Nominatim asked us to slow down; 503 Nominatim unreachable |
| GET | `/api/farms/nasa-colour` | query `colormap` (`[A-Za-z0-9_]{3,100}`), `r`, `g`, `b`, `a` (0–255; `a` defaults to 255) | `ColourReading` {status: class / nodata / transparent / unknown, low, high, range_text, units, title, label} | 404 unknown colour map; 503 GIBS unreachable; 422 |
| POST | `/api/farms` | `FarmCreate` {name, region?, priorities?, constraints?, location_lat?, location_lon?} | 201 `FarmOut` | 422 (including only one of lat/lon); 409 duplicate |
| GET | `/api/farms/{farm_id}` | none | `FarmOut` (with fields, soil layers, crop history) | 404 |
| PATCH | `/api/farms/{farm_id}` | `FarmUpdate` (any subset) | `FarmOut` | 404, 422 |
| DELETE | `/api/farms/{farm_id}` | none | 204. Cascades to fields, soil layers, crop history and the Simulator's `simulation_runs`. | 404 |
| POST | `/api/farms/{farm_id}/fields` | `FieldCreate` {name, boundary (GeoJSON Polygon, [lon, lat]), area_ha?, irrigation_available?, current_crop_id?, soil_texture?} | 201 `FieldOut` | 404; 409 overlap; 422 bad boundary |
| GET | `/api/farms/{farm_id}/fields/{field_id}` | none | `FieldOut` | 404 |
| PATCH | `/api/farms/{farm_id}/fields/{field_id}` | `FieldUpdate` (any subset; `area_ha: null` means use the computed area) | `FieldOut` | 404; 409 overlap (only when the boundary changes); 422 |
| DELETE | `/api/farms/{farm_id}/fields/{field_id}` | none | 204 | 404 |
| PUT | `/api/farms/{farm_id}/fields/{field_id}/soil` | `SoilLayerIn[]` (the whole profile; each layer needs `source`, and bottom > top) | `FieldOut` | 404, 422 |
| POST | `/api/farms/{farm_id}/fields/{field_id}/soil/prefill` | none | `FieldOut` with SoilGrids layers | 404; 503 no SoilGrids data here (message gives the next step) |
| GET | `/api/farms/{farm_id}/fields/{field_id}/weather` | none | `WeatherOut` {source, sources, latitude, longitude, start, end, time_standard, series: `WeatherSeries[]`} | 404; 503 POWER unreachable or not 200 |
| POST | `/api/farms/{farm_id}/fields/{field_id}/crop-history` | `CropHistoryIn` {season_year, crop_id, yield_value?, yield_unit?, source?, notes?} | 201 `FieldOut` | 404; 409 same crop and year; 422 |
| DELETE | `/api/farms/{farm_id}/fields/{field_id}/crop-history/{entry_id}` | none | 204 | 404 |

`/places` and `/nasa-colour` are declared before `/{farm_id}` on purpose, so "places" is not read as a farm id.
Keep that order. `tests/croptwin/test_route_coverage.py` checks that every route has a success and a failure test.

## 5. Database

The models are in `backend/app/modules/croptwin/models.py` and the migrations in `backend/migrations/versions/`.

| Table | Holds | Key points |
|---|---|---|
| `farms` | name, region, priorities (JSON), constraints, `location_lat`, `location_lon`, created_at, updated_at | The point is optional; both values or neither (`schemas._FarmPoint`) |
| `fields` | farm_id → farms (ON DELETE CASCADE), name, boundary (GeoJSON in a JSON column, [lon, lat], WGS84), centroid, area_ha, area_source (`computed_from_boundary` or `farmer`), irrigation, current_crop_id, soil_texture | Centroid and computed area are set in `service._set_boundary` |
| `soil_layers` | field_id → fields (CASCADE), depths, sand, silt, clay, SOC, pH, `source`, retrieved_at | `source` is required provenance |
| `crop_history` | field_id → fields (CASCADE), season_year, crop_id, yield, unit, source, notes | Unique per field, crop and year (duplicates give 409 through `_commit`) |

- **Migration `20261114_0003_croptwin_farm_location.py`** (revision `0003`, revises `0002`) adds nullable
  `farms.location_lat` and `farms.location_lon`. Existing farms are unchanged.
  - Check `alembic current` before any downgrade on a shared database.
  - The local dev database is at `0003`.
- **Cascades:**
  - The ORM relationships use `cascade="all, delete-orphan"`, and the foreign keys use `ON DELETE CASCADE`.
  - Deleting a farm also deletes the Simulator's `simulation_runs` for that farm (`simulation_runs.farm_id`
    `ondelete='CASCADE'`, migration 0002). The UI says so before deleting.
  - Deleting a field does not touch saved runs, because runs have no foreign key to fields. Such a run still opens,
    but re-running it fails.
- **Timestamps:**
  - Written as UTC.
  - Every timestamp the API returns is `UtcDatetime` (`schemas.py`), which marks naive values (SQLite) as UTC.
  - New timestamp fields in responses must use `UtcDatetime`.

## 6. Merge notes

### Changes in files CropTwin doesn't own
- **`frontend/src/shared/map/FarmMap.tsx`** (shared UI owner; also rendered by `simulator/pages/SimulatorPage.tsx`):
  - optional `children` prop: overlays and controls render inside the map
  - optional `MapField.alert`: alert-coloured outline
  - zoom buttons 44 px on phones, and no animation under `prefers-reduced-motion`
  - **Pan-to-selected fix:** `FitFields` now reads fields from a `fieldsRef`, and its effect depends on
    `[selectedId, map]` only. Before, it depended on the `fields` array, which is new on every render, so the map was
    pulled back after every search or "Locate me". The Simulator page benefits too. Don't put `fields` back in the deps.
- **New shared map files** (shared code added by CropTwin; reusable by any module):
  - `BoundaryDraw.tsx`, `NasaLayerControl.tsx`, `nasaLayers.ts`, `gibs.ts`, `pixelSample.ts`, `dates.ts`
  - `MapFocus.tsx`, `MapSearch.tsx`, `LocateControl.tsx`, `geolocation.ts`, `ReferenceLayers.tsx`, `ImageryDate.tsx`
- **`frontend/src/app/App.tsx`** (app shell owner): one import, and the line
  `if (route === "farm-profile") return <FarmProfilePage route={route} onNavigate={navigate} />;`. Keep both.
- **Migration `0003`**: keep the revision chain `0002 → 0003`. If another branch also adds a migration on top of
  `0002`, one of them must be re-pointed (`down_revision`) so there is a single head.

### Contracts that must change together
- `backend/app/modules/croptwin/schemas.py` ↔ `frontend/src/modules/croptwin/types.ts`: one contract. Change both in
  the same commit.
- **The crop list exists in three places** (on purpose: CropTwin must not import the Simulator):
  `simulator/parameters.py` `CROPS` keys, `schemas.py` `CropId`, and `types.ts` `CROPS`. Today they are maize,
  soybean, oats, winter_wheat and sunflower.
- **Soil textures:** `schemas.py` `SoilTexture`, `types.ts` `SOIL_TEXTURES`, and `simulator.parameters.SOILS`
  (FAO-56 Table 19 classes).
- **The overlap and crossing tests:** `geometry.py` ↔ `BoundaryDraw.tsx`.

### What `simulator/ports.py` relies on (don't rename or change the meaning)
- `croptwin.service.get_farm`, `get_field`, and `NotFound`
- `FarmOut.fields`, `.priorities` (dumped with `by_alias=True`, so `yield` not `yield_`)
- `FieldOut.id`, `name`, `current_crop_id`, `area_ha`, `irrigation_available`, `centroid_lat` and `centroid_lon`
- `boundary.coordinates[0]` in [lon, lat] order
- `soil_layers` (with `sand_pct`, `clay_pct`, `depth_bottom_cm`, `source`) and `soil_texture`
- The demo ids `demo`, `north`, `creek` and `west` from `seed.py`. The Simulator page uses `FARM_ID "demo"`.

### Open items by owner
The full list is in `croptwin.md`, "Open items". In short:
- **Shared connectors owner:**
  - a live SoilGrids connector (`(lat, lon) -> layers`), which replaces the sample in `soil_source.soilgrids_profile`
  - NASA point connectors (SMAP, IMERG, MODIS) with an Earthdata login, for real numbers instead of colour classes
  - a `nasa_power` connector to replace `weather_source._fetch`
- **Shared UI owner:** `shared/api/http.ts` has no `patch` or `put`, so `croptwinApi.ts` carries a local copy.
- **App shell owner:** the top bar's farm switcher is still a placeholder, and `PlaceholderPage` still lists CropTwin
  in `OWNER`.
- **Platform owner:** the Nominatim URL could become a setting in `core/config.py` (it is the constant
  `places.NOMINATIM_SEARCH` today).
- **Simulator owner:**
  - take a farm id (today it reads only `demo`)
  - say so when a run's field was deleted
  - optionally read soil through `croptwin.service` instead of the sample

## 7. For AI agents

- **Rules:** read `CLAUDE.md`, `README.md` and `DESIGN.md` first.
  - Modules import each other only through `service.py`.
  - Every shown number is Observed, Modelled or Scenario, with its source.
  - Never invent measurements, yields or citations.
  - No raw hex in components; use the `DESIGN.md` tokens.
  - Don't commit unless asked, and add no Claude attribution lines.
- **Where to start:**
  - backend: `service.py` (the public API) → `router.py` → `schemas.py`
  - frontend: `pages/FarmProfilePage.tsx` → `state/useFarmProfile.ts` → `lib/draft.ts`
  - Every file has a header comment saying what it's for and who owns it.
- **Checks (Windows paths shown):**
  - `cd backend; .venv\Scripts\python -m pytest` (92 tests across the repo; 52 in `tests/croptwin`)
  - `cd frontend; npm run build`
  - On macOS and Linux the venv path is `.venv/bin/python`.
- **Browser testing without breaking user data:**
  - The dev database holds the user's real farms. Create your own test farm, work only on it, and delete only what
    you created.
  - Never edit or rename the user's farms or fields. Click by element reference, not by coordinates, so a stray click
    can't land in someone else's form.
  - Keep each page script short (under about 45 s). A timed-out script can keep running in the page and change later
    results, so reload after a timeout.
  - Don't run place searches in a loop. Nominatim allows 1 request per second, and the policy forbids bulk use.
  - Avoid browser `alert` and `confirm` dialogs. The app uses its own dialog for this reason.
- **Proving a comment-only change:** strip comments and compare against a snapshot. For Python, use `tokenize`
  (drop COMMENT and NL tokens and docstrings) plus an `ast` check. For TypeScript, use
  `tsc --ignoreConfig --removeComments` output plus a line diff.

## 8. Testing

- **Backend** (`backend/tests/croptwin/`, an in-memory SQLite database per test from `backend/tests/conftest.py`):
  - `test_api.py` (7): area and centroid, ring closing and bad polygons, farm and field lifecycle, validation, sources
    kept, the demo seed ids, health
  - `test_overlap.py` (14): touching versus overlapping shapes (parametrised), 409 on create and on a boundary update
    (which changes nothing), other farms not checked, an existing overlap still allows other edits
  - `test_soil_prefill.py` (6): the sample adapter within and beyond 5 km, the prefill route and its errors, crossing
    boundaries and unknown crops refused, and a field read back through `simulator/ports.py`
  - `test_nasa_values.py` (7): colour classes from saved GIBS XML (SMAP, IMERG, transparent and no data), the colour
    route, and POWER weather (units, cache, 503)
  - `test_places.py` (5): results mapped and cached, short query 422, upstream errors, calls spaced a second apart (no network)
  - `test_farms.py` (4): create and list with a point, half or invalid point 422, update and clear the point, delete
    cascades to fields, soil and history
  - `test_field_delete.py` (2): a field delete removes its soil and history; an unknown field is 404
  - `test_route_coverage.py` (7): every route has a success and a failure test
- **Fixtures** (`tests/croptwin/fixtures/`): `colormap_SMAP_Analyzed_Soil_Moisture.xml`,
  `colormap_GPM_Precipitation_Rate.xml` (saved GIBS colour maps) and `power_daily_42.03_-93.46.json` (a saved POWER
  response). Tests never call NASA, Esri or Nominatim.
- **Frontend:** no unit tests. `npm run build` type-checks everything.
- **Manual browser checks:** the full checklist is in `croptwin.md`, "Test record", items A to C14. The short version:
  - dates on every card
  - all 10 NASA layers at a field (tiles, date line, value or "nothing drawn")
  - new farm from search
  - drawing with an overlap warning, and a fence line that saves
  - soil prefill refused at 13 km and working within 5 km
  - crop history add, duplicate and delete
  - leave guard
  - location allowed and denied
  - search that doesn't snap back
  - borders toggle
  - Escape closes the open panel
  - delete field and farm
  - phone width: no horizontal scroll, every control ≥ 44 px
  - all controls named and reachable by Tab
  - no console errors
