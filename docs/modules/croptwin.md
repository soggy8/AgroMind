# CropTwin

CropTwin answers *What is my farm?* It holds the farm profile (fields, boundaries, area, crops,
soil, irrigation, priorities, constraints), and CropDoctor and the Simulator read it through
`backend/app/modules/croptwin/service.py`. Scope: `backend/app/modules/croptwin/README.md`.

**Merging or picking this up?** Start with [croptwin_handoff.md](croptwin_handoff.md): every feature, file, data source,
route, table and merge note in one place.

## What's built

**Backend** (`backend/app/modules/croptwin/`)

- Tables `farms`, `fields`, `soil_layers`, `crop_history` (migration `20261114_0001`). Conventions: `docs/architecture.md`, "Database".
- `geometry.py`: area and centroid from the GeoJSON boundary. It rejects outlines with fewer than three corners, zero area, or crossing edges.
- `soil_source.py`: the SoilGrids adapter. `soilgrids_profile(lat, lon)` reads
  `data/samples/soilgrids_story_county_ia.json`. It copies the file's `_source` citation into every layer's `source`,
  and the "queried" date into `retrieved_at`. It raises `SoilDataUnavailable` for fields more than 5 km from the sample point.
- `service.prefill_soil_from_soilgrids(session, farm_id, field_id)`: replaces a field's soil layers with SoilGrids values at its centroid.
- `seed.py` loads the demo farm, using the same adapter for soil.
- Crop ids are validated (`CropId` in `schemas.py`). A null `area_ha` in a field PATCH switches back to the computed area.

**Frontend** (`frontend/src/modules/croptwin/`, route `#/farm-profile`)

- `pages/FarmProfilePage.tsx`: the Simulator's shell, with the top bar and floating glass panels over the satellite map.
  On phones it's a map plus a tabbed sheet.
- Left panel (`components/FarmPanel.tsx`): the "Demo farm with sample data" notice, the fields list, Draw a field,
  priority weights (yield, water, risk, soil, margin), constraints, and the one primary button, **Save farm**.
- Right panel (`components/FieldPanel.tsx`):
  - The field editor: name, current crop, soil texture, irrigation, and area. Area is labelled "computed from boundary" or "farmer-stated".
  - The boundary: edit or redraw it on the map, or type the corners.
  - `SoilTable.tsx`: every layer links to a numbered source with a kind tag.
    SoilGrids layers are MODELLED (mapped estimates at about 250 m); farmer layers are OBSERVED with the source "Farmer-provided".
    There's a Prefill from SoilGrids button.
  - `CropHistoryList.tsx`: add and delete entries. Yields are farmer-reported only.
- States (DESIGN.md section 9): skeleton panels while loading, "Draw your first field" when there are no fields, and
  errors that name the problem and the next step. For example, a missing demo farm tells you to run the seed command.
- Field edits, soil layers you type, farm name and region, priorities and constraints are drafts until **Save farm**.
  Soil prefill, crop history and deleting a field save straight away, so they need a saved field.
- After each save, a status line (`role="status"`) says what was stored, e.g. "Saved South Pasture and priorities."
- **Delete field** opens an in-app dialog (`components/ConfirmDialog.tsx`, also used by soil prefill and the leave
  guard). It names the field, its area and what goes with it. Focus is trapped, Escape cancels, focus returns afterwards.
- **Leaving with unsaved changes:** top-bar navigation asks first (in-app dialog); a reload or tab close gets the browser's own prompt.
- **Crossing outlines** are caught before saving: the drawing toolbar and the field editor warn, and Save farm refuses
  with a message. The API still rejects them too.
- **Lab soil layers:** the form explains that the Simulator only uses a layer with both sand % and clay %, and shows
  a note while one is missing.
- **Phone (< 640 px):** checked at 420 px wide in an iframe, because the Chrome window was maximized and couldn't be resized.
  There's no horizontal scroll, CropTwin controls are at least 44 px tall, and the drawing toolbar wraps clear of the zoom buttons.

**Shared map component** (built to the DESIGN.md spec): `frontend/src/shared/map/BoundaryDraw.tsx`, using only
leaflet and react-leaflet.
- Drawing: click to place corners, or use "Add corner" at the crosshair (the map pans with the arrow keys).
  Undo removes the last corner, and the shape closes when you click the first corner or press Close shape.
- Keyboard: Enter closes the shape (3+ corners), Backspace undoes a corner, Escape cancels. These keys are ignored
  while focus is in an input, select, textarea or button.
- After closing: drag corners to adjust, or press Redraw to start over.
- The toolbar warns if edges cross. `selfIntersects()` is exported, a port of `geometry._self_intersects`.
- The toolbar buttons sit on their own row above the status text, so they don't move when the text changes length.
- `FarmMap.tsx` gained one optional `children` prop so the drawing layer can live inside the map.

## API routes (`/api/farms`)

| Method | Path | Does |
|---|---|---|
| GET | `/api/farms` | list farms with field counts |
| GET | `/api/farms/places?q=&lang=` | place search through Nominatim (429 when asked to slow down, 503 when unreachable) |
| GET | `/api/farms/nasa-colour?colormap=&r=&g=&b=&a=` | NASA's value class for a GIBS pixel colour |
| POST | `/api/farms` | create a farm |
| GET / PATCH / DELETE | `/api/farms/{farm_id}` | read, update (name, region, priorities, constraints, map point), delete |
| POST | `/api/farms/{farm_id}/fields` | create a field from a GeoJSON boundary |
| GET / PATCH / DELETE | `/api/farms/{farm_id}/fields/{field_id}` | read, update, delete a field |
| PUT | `/api/farms/{farm_id}/fields/{field_id}/soil` | replace soil layers (each needs a `source`) |
| POST | `/api/farms/{farm_id}/fields/{field_id}/soil/prefill` | replace soil layers with SoilGrids values. Returns 503 with a next step when no SoilGrids data covers the field |
| GET | `/api/farms/{farm_id}/fields/{field_id}/weather` | last 30 days of NASA POWER weather at the centroid (503 when POWER fails) |
| POST | `/api/farms/{farm_id}/fields/{field_id}/crop-history` | add a previous crop (409 if that crop and year already exist) |
| DELETE | `/api/farms/{farm_id}/fields/{field_id}/crop-history/{entry_id}` | remove one |

## Assumptions

- **Assumption: SoilGrids sample radius of 5 km (unsourced).** The saved sample is served for fields within 5 km of 42.03 N, 93.46 W.
  The demo fields are 0.5–1.5 km away. SoilGrids itself is a 250 m grid, so this treats nearby cells as alike,
  which is acceptable for a demo but not for real fields. It goes away when the live connector exists.
- **Assumption: the soil sample's depth gaps stay gaps.** The sample has no 5–30 cm layer. CropTwin stores what the file holds.
  The Simulator decides how to treat the gap (`simulator/ports.py`).
- **Assumption: the map fallback centre (unsourced).** A farm with no fields and no map point, when the browser's location
  isn't available, opens on the demo sample point.
- **Assumption: how values are labelled.**
  - SoilGrids layers: MODELLED, because ISRIC SoilGrids v2.0 values are mapped predictions, not measurements (source: the sample's `_source`).
  - Farmer- or lab-entered soil and farmer-reported yields: OBSERVED, source "Farmer-provided".
  - A farmer-stated area: OBSERVED. An area computed from the boundary: MODELLED, because it's an equirectangular approximation of a hand-drawn outline (`geometry.py`).
- **Assumption: crop history only accepts the five crops the Simulator models.** A farmer's earlier crops outside that list
  (e.g. alfalfa) can't be recorded yet.
- **Assumption: deleting a field leaves Simulator runs alone.** Saved runs have no foreign key to fields
  (`simulator/models.py`). A run for a deleted field still opens with its stored result, but re-running it fails
  because the field id is gone. The delete dialog says so.
- **Assumption: a farmer soil layer's date is when it was entered.** It's labelled "Entered", while SoilGrids layers are
  labelled "Retrieved".
- **Assumption: priority weights use the Simulator's four levels** (Off 0, Low 1, Med 2, High 3), so the profile and the
  Simulator show the same scale. The backend accepts any weight ≥ 0.

## Duplicated lists (keep in sync)

The crop list exists in three places, on purpose, because CropTwin must not import the Simulator:

1. `backend/app/modules/simulator/parameters.py`, keys of `CROPS` (owner: Simulator)
2. `backend/app/modules/croptwin/schemas.py`, `CropId`
3. `frontend/src/modules/croptwin/types.ts`, `CROPS`

Today all three are `maize, soybean, oats, winter_wheat, sunflower`. Soil texture classes are duplicated the same way
(`SoilTexture` in `schemas.py`, `SOIL_TEXTURES` in `types.ts`, `simulator.parameters.SOILS`).

## No overlapping fields

- Fields on the same farm may share an edge or a corner (a fence line) but not area. `geometry.overlaps` counts
  shared area when edges properly cross, a corner or an edge midpoint lies strictly inside the other outline, or the
  outlines are identical. Exact arithmetic, no tolerance, so two hand-drawn neighbours must meet exactly to count as touching.
- The API returns 409 on create, and on update when the boundary changes ("This boundary overlaps West Field. Adjust it
  so fields don't share area."). Updates that don't change the boundary still work on fields that already overlap.
  Other farms aren't checked.
- The UI runs the same test (`overlaps` in `shared/map/BoundaryDraw.tsx`) while you draw, edit or type corners. It warns
  in the toolbar and the field editor, outlines the overlapped field in the alert colour, and blocks Save farm.
- Existing data, read-only check on 2026-11-14: Field 7 and Field 8 on the demo farm overlap. Not changed.

## NASA layers (map overlay)

The **NASA data** control on the farm profile map (`shared/map/NasaLayerControl.tsx`) shows one NASA layer at a time
over the satellite imagery, under the field outlines.
- Tiles come from NASA GIBS (the service Worldview uses). There's no key and no backend.
- Available dates come live from GIBS WMTS DescribeDomains. The latest is picked by default, and a picked date snaps to
  the nearest earlier date with data.
- The legend shows the kind, product and version, date, units, NASA's colour key, the pixel size with a plain note
  when a pixel is bigger than a field, and links to NASA Worldview (same view, layer and date) and Earthdata Search.

Layer ids, tile matrix sets, legends and units were read from NASA's own metadata on 2026-11-14:
- the GIBS capabilities (`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml`)
- GIBS layer metadata (`/layer-metadata/v1.0/<id>.json`)
- GIBS colour maps (`/colormaps/v1.3/…`)
- the CMR collection records

| Dataset | GIBS layer id | Kind (why) | Pixel | Dates in GIBS (2026-11-14) |
|---|---|---|---|---|
| SMAP (satellite) | `SMAP_L3_Passive_Enhanced_Day_Soil_Moisture` | Observed: "retrieved by the SMAP radiometer" (SPL3SMP_E v006) | 9 km | 2015-03-31 to 2026-11-11, daily, with gaps |
| SMAP (model) | `SMAP_L4_Analyzed_Surface_Soil_Moisture` | Modelled: "output by the L4_SM algorithm"; GIBS: "Model Value-Added" (SPL4SMAU v008) | 9 km | 2015-03-31 to 2026-11-10, daily |
| MODIS NDVI | `MODIS_Terra_L3_NDVI_16Day` | Observed: 16-day vegetation index (MOD13Q1 v061) | 250 m | 2000-03-05 to 2026-10-16, every 16 days |
| GPM IMERG | `IMERG_Precipitation_Rate` | Modelled: multi-satellite estimates "gridded, intercalibrated … and merged" (GPM_3IMERGHH V07) | 0.1° (about 10 km) | 2000-06-01 to 2026-11-13, daily |
| Landsat (HLS) | `HLS_L30_Nadir_BRDF_Adjusted_Reflectance` | Observed: surface reflectance (HLSL30 v2.0) | 30 m | 2013 to 2026-11-06, daily, sparse |
| GRACE / GRACE-FO | `GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI` | Modelled: gravity inversion with "realistic geophysical information … introduced" (JPL Mascon RL06Mv02) | 3° mascons | 2002 to 2022-07-01, monthly |
| SMAP root zone (model) | `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` | Modelled: same L4_SM analysis (SPL4SMAU v008) | 9 km | daily, to 2026-11-10 |
| MODIS land surface temperature | `MODIS_Terra_Land_Surface_Temp_Day` | Observed: LST retrieved from MODIS Terra (MOD11_L2 6.1NRT); units K (colour map) | 1 km | daily (near real time) |
| VIIRS NDVI | `VIIRS_NOAA20_NDVI_8Day` | Observed: rolling 8-day index, NOAA-20 (VJ113A4N v2) | 500 m | daily rolling, to 2026-11-13 |
| Sentinel-2 (HLS) | `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` | Observed: surface reflectance (HLSS30 v2.0) | 30 m | daily, sparse |
| ECOSTRESS | not in GIBS | Modelled: PT-JPL evapotranspiration (ECO_L3T_JET v003, `C4057232489-LPCLOUD`) | 70 m | link to Earthdata Search only |

- **Assumption: GRACE's date list.** GIBS DescribeDomains lists GRACE dates to 2022-12-01, but tiles after 2022-07-01
  fail (404/503). When the date was picked automatically and every tile fails, the control steps back one available
  date at a time (up to 12). A date you pick yourself is never changed; you get "No … data for <date> here" instead.
- **Assumption: transparent IMERG pixels.** GIBS's IMERG colour map makes both "No Data" and "Insignificant" (< 0.1 mm/hr)
  transparent, so a clear area means one of the two; the legend note says so.
- **Assumption: the Earthdata Search link format (unsourced).** `search.earthdata.nasa.gov/search/granules?p=<collection id>`.
  I couldn't find documentation for it; I checked by opening it, and it shows the right collection. Worldview links use
  the documented `v`, `l` and `t` parameters (`doc/url_parameters.md` in nasa-gibs/worldview).
- These are map images, not measurements. The readout under "Values for a field" gives NASA's colour class at a field.
  A measured value (e.g. soil moisture in m³/m³ at its centroid) needs the shared connectors and an Earthdata login.

## Several farms

- `farms` has an optional point (`location_lat`, `location_lon`; migration `20261114_0003`), where a farm's map opens
  until it has fields. It's validated as a real latitude and longitude, and both values or neither are sent.
- On the farm profile: a farm picker (with field counts), **New farm** (name, region, and a point from "Use my location",
  a map click or a search result), and **Delete farm**. The confirm dialog gives the number of fields, soil layers and
  crop-history entries, and says the Simulator's saved runs for the farm go too (`simulation_runs` cascades on farm delete).
- The last chosen farm is remembered in `localStorage` (`agromind.croptwin.farm`). Otherwise `demo` opens, or the first farm.
  With no farms, the page opens on New farm.

## Where the map starts, and your location

- A farm with fields fits its fields. A farm with only a point centres on it. Otherwise a card asks "Start the map where you
  are?", explaining why, and uses the browser's Geolocation API once if you agree. If you say "Not now", or location is
  blocked, the map shows the fallback point with "Location off: showing Story County, Iowa. Search for your area or allow location."
- A **Locate me** button sits under the zoom buttons, with a marker and the browser's accuracy circle.
- **Privacy:** your location stays in the page's memory. It is never sent to our backend or anyone else, and never
  stored. The one exception is creating a farm with "Use my location", which saves that point as the farm's.

## Search

- One box on the map. Your farms and this farm's fields match as you type, without leaving the browser. Typed
  coordinates ("42.03, -93.46") go straight there. Place names are looked up only when you press **Enter**.
- Place names come from OpenStreetMap's **Nominatim**, through our backend (`GET /api/farms/places?q=&lang=`, `places.py`).
  The project owner chose it on 2026-11-14 after reading its usage policy
  (https://operations.osmfoundation.org/policies/nominatim/), which requires:
  - "an absolute maximum of 1 request per second": enforced server-wide in `places._wait_turn`
  - "a valid HTTP Referer or User-Agent identifying the application": sent as `AgroMind/0.1 (NASA Space Apps …)`
  - "Clearly display attribution": shown under the results
  - "Auto-complete search" is forbidden: searches run on Enter only
  - results must be cached: done in memory, per query and language
  - the service must be switchable without a software update: it's one server-side constant, `NOMINATIM_SEARCH`
- Only the typed text and the browser's language are sent (for `accept-language`).

## Borders and place names

- Shown by default, with a toggle in the map's layer panel. **Assumption (checked 2026-11-14):** NASA GIBS's reference layers
  (`Reference_Features_15m`, `Reference_Labels_15m`) returned opaque all-black placeholder tiles, and their KVP endpoint
  returned 500, so they would hide the map.
- We use Esri's World Boundaries and Places instead
  (`server.arcgisonline.com/…/Reference/World_Boundaries_and_Places/MapServer`, item a842e359856a4365b1ddf8cc34fde079).
  - It's public, under the Esri Master License Agreement: the same server and agreement as the World Imagery basemap
    already used, and "designed for use with … World Imagery".
  - It must not be exported for offline use, which we don't do.
  - Attribution is the service's copyright text, shown in the source pill.

## Values for a field (NASA colour classes)

- With a field selected and a layer that has a colour scale, the layer panel shows that layer's value at the field's centre.
  For example, "0.339–0.342 m³/m³" for SMAP L4 surface soil moisture on 2026-11-10.
- **How it's read:**
  1. The browser reads the exact colour of the GIBS tile pixel at the layer's native zoom, so there's no blending. GIBS
     tiles send `Access-Control-Allow-Origin: *`.
  2. The backend (`GET /api/farms/nasa-colour`, `colour_classes.py`) looks that RGB up in NASA's own colour map
     (`/colormaps/v1.3/<name>.xml`). In every map checked, each class has a unique colour.
  3. The answer is NASA's class range. There's no interpolation and no nearest-colour guess. Transparent pixels report
     NASA's own legend words, e.g. "insignificant, no data" for IMERG.
- Kelvin is also shown in °C (K − 273.15, exact). The note always says it's the class of a pixel of that size, not a field measurement.
- **Sanity check:** NASA Worldview for the same layer and date showed the same cyan-teal colour over the farm.

## Recent weather (NASA POWER)

- The field panel shows the last 30 days of POWER daily precipitation, max/min air temperature and solar radiation at the field's
  centroid (`GET /api/farms/{farm_id}/fields/{field_id}/weather`, `weather_source.py`, cached for 6 hours).
- POWER's Daily API (v2.10.3) declares no authentication in its OpenAPI document, so there's no key. Units and long names come
  from the response, and POWER's fill value (-999) is shown as missing.
- **Assumption: labelled Modelled.** POWER calls these "Analysis Ready Data", and the response lists its sources for these
  days as GEOSIT, FLASHFLUX and POWER.
- The 30-day total or mean is computed by AgroMind and labelled as such.

## Dates: how fresh is each piece of data

One helper (`shared/map/dates.ts`) formats every date. Provider days are UTC calendar days ("Nov 10, 2026 · 4 days
ago"); our own timestamps are shown in local time ("Nov 14, 2026, 5:18 PM · 1 h ago"). Every timestamp the API
returns is marked UTC (`UtcDatetime` in `schemas.py`), because SQLite returns times without a zone and the browser
would read them as local.

| What's shown | Where it comes from | Example |
|---|---|---|
| NASA layer: date shown, latest date, how often published | GIBS WMTS DescribeDomains (live) | "Showing Nov 10, 2026 · 4 days ago · NASA publishes it daily"; "Latest from NASA …" with **Show latest** |
| NASA date in the source line and on the layer button | the same | "NASA GIBS SPL4SMAU Nov 10, 2026 · 4 days ago" |
| Satellite imagery capture date | Esri World Imagery "Citations" layer (layer 4, Query): `SRC_DATE`, `SRC_RES`, `SRC_DESC`/`NICE_DESC`, the record shown at the current zoom | "Imagery © Esri, captured Jul 14, 2025 · 16 months ago (Vantor WV02, 0.5 m)" |
| Farm saved | `farms.updated_at` | "Farm details saved Nov 14, 2026, 5:18 PM · 1 h ago" |
| Data as of | when the page loaded the farm (browser clock) | "data as of Nov 14, 2026, 6:45 PM" |
| Field saved and added | `fields.updated_at`, `fields.created_at` | "Field details saved … · added Nov 14, 2026, 2:36 PM" |
| SoilGrids layer | `soil_layers.retrieved_at` (the sample's "queried" day) | "Retrieved Nov 14, 2026 · today" |
| Lab layer | `soil_layers.retrieved_at` (when saved) | "Entered Nov 14, 2026, 6:38 PM" |
| Weather period and last day | POWER response header (`start`, `end`) and the last day with a value | "Oct 15 – Nov 13, 2026. Last day with data: Nov 11, 2026 · 3 days ago" |

**Assumption (seen 2026-11-14):** NASA's date lists can run past real tiles.
- GRACE is listed to Dec 2022, but its tiles end in Jul 2022. The panel steps back until tiles load, and treats that date as "latest".
- MODIS land surface temperature was listed for tomorrow, with nothing drawn yet. Dates after today (UTC) are never picked, offered or allowed.

## "Nothing drawn here" (why a NASA layer can look like it isn't loading)

Daily swath layers (SMAP L3, IMERG) and field-scale images (HLS Landsat and Sentinel-2) often have **no data over the
farm on the latest date**. NASA still answers HTTP 200, but the tile is transparent. So:
- After tiles load, the panel reads the pixel at the selected field (or the map centre). If it's transparent, the panel
  says "Nothing drawn at West Field on Nov 13, 2026" with the reason.
- It offers **Find the latest date with data here** ("…with rain…" for IMERG). That steps back through NASA's listed dates,
  up to 20, checking only that one pixel. Example: IMERG found rain on Nov 3; HLS found a clear image on Oct 22.
- Selecting a field zooms the map to it when it's too small or off-screen. Field-scale layers (pixels under 1 km) show
  "Zoom in to see this layer" with **Zoom to <field>**.

## Test record (2026-11-14)

- **pytest:** 92 passed. Every CropTwin route has a success and a failure test; `GET /api/farms` (list) has no failure path to test.
- **Browser checklist (Chrome; phone width in a 420 px iframe)**, run twice, all passing on the final run:
  - A, dates: farm, field, soil, weather, and the source line with the imagery capture date
  - B, NASA layers: all 10 at West Field, with tiles, date line, value or "nothing drawn", and the ECOSTRESS link
  - C1, new farm from place search (Nominatim, 2 searches in total)
  - C3, fields: draw, save, overlap warned and blocked, fence line saved
  - C4, soil: prefill (refused 13 km away; 3 layers within 5 km), lab layer with its sand/clay hint, keep-my-layers dialog
  - C5, crop history: add, duplicate refused, delete
  - C6, priorities and constraints saved
  - C7, leave guard dialog, Escape stays
  - C8, location: stubbed success and denial
  - C9, search: coordinates and your own fields by keyboard
  - C10, borders toggle
  - C11, Escape in the search list, NASA panel and drawing
  - C12, delete field and farm through the dialogs
  - C13, phone: no overlap, no horizontal scroll, every control ≥ 44 px
  - C14, 68 controls, all named and reachable by Tab
  - console: no errors or warnings
- **Defects found and fixed:**
  - NASA layers looked like they weren't loading → no "nothing here" state, and no zoom to field → now detected, explained, with a find-latest option
  - timestamps came back in mixed formats → SQLite returns times without a zone → `UtcDatetime`
  - GRACE offered a false "latest" date → NASA's date list runs past its tiles → use the date that actually loaded
  - an overlap save error stayed after the fix → it only cleared on the next save → it now clears on edit
  - dialogs listed "0 …" counts → dialog wording → only non-zero counts are listed
  - land surface temperature showed "in the future" → NASA lists tomorrow → dates are capped at today (UTC)
  - the source line covered the left panel → it had no left limit → it's kept between the panels, with the NASA control above it
  - the zoom buttons were 38 px on phones → they're now 44 px

## Open items, and what's needed from whom

- **Shared connectors owner:** a real `backend/app/shared/connectors/soilgrids.py`. CropTwin needs one function,
  `(lat: float, lon: float) -> layers`, where each layer has depth_top_cm, depth_bottom_cm, sand/silt/clay %, SOC g/kg,
  pH and a citation string. Then the body of `soil_source.soilgrids_profile` becomes a call to it, and the 5 km limit goes away.
- **App shell owner:** `frontend/src/app/App.tsx` now routes `farm-profile` to `FarmProfilePage` (one import, one line).
  `PlaceholderPage` still lists CropTwin in `OWNER` but no longer renders for it.
- **Shared UI owner:** `frontend/src/shared/api/http.ts` has no `patch` or `put`. CropTwin carries a small local copy
  in `api/croptwinApi.ts` until it does. `FarmMap` now accepts `children`.
- **Simulator owner:**
  - `ports.load_soil()` still parses the SoilGrids sample itself. It could read the demo field's layers through `croptwin.service` instead.
  - Seeded soil layers now carry the sample's `_source` text, which still contains "SoilGrids", so `_soil_from_layers` labels them the same way.
- **Done (2026-11-14):** farms have an optional map point (`farms.location_lat`, `farms.location_lon`, migration 0003).
- **Shared connectors owner:** point values from NASA (SMAP, IMERG, MODIS) for a field's centroid need
  `shared/connectors/smap.py`, `gpm_imerg.py` and `modis.py`, with an Earthdata login from settings. Then CropTwin or
  CropDoctor could show a number next to the map layer.
- **Simulator owner:** the Simulator still reads only farm `demo` (`FARM_ID` in `SimulatorPage.tsx`). Other farms need it to
  take a farm id, e.g. from the same `localStorage` key or a route parameter.
- **App shell owner:** the top bar's farm switcher is still a placeholder; the working farm picker is on the farm profile.
  Moving it to the top bar needs `TopBar.tsx`.
- **Platform owner:** the Nominatim URL is a constant in `croptwin/places.py`, because `core/config.py` is outside CropTwin.
  A setting there would let it change without a code edit.
- **Shared map owner:** `FarmMap` gained an optional `alert` flag on `MapField` (alert-coloured outline). NASA overlays
  are rendered through its existing `children` prop, so no separate overlay prop was added.
- **Simulator owner:** a saved run whose field was deleted could say so when it's opened, instead of failing on re-run.
- Not built: holes in field boundaries.
