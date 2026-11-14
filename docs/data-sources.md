# Data sources

Verify availability, resolution, coverage, access, and licensing before implementing each connector.

| Source | Use | Connector | Notes |
|---|---|---|---|
| NASA POWER | Daily temperature, precipitation, solar, humidity | `nasa_power.py` | Start here. No auth. |
| SMAP | Surface soil moisture | `smap.py` | ~9–36 km; not field-scale |
| MODIS | NDVI / EVI | `modis.py` | 250 m, frequent revisit |
| Landsat | Field-scale vegetation | `landsat.py` | 30 m, 8–16 day revisit, clouds |
| GPM IMERG | Satellite precipitation | `gpm_imerg.py` | ~10 km, half-hourly to monthly |
| ISRIC SoilGrids | pH, texture, organic carbon | `soilgrids.py` | 250 m modelled estimates |
| ECOSTRESS, GRACE-FO | ET / water storage | — | Stretch goals |

Earthdata Login is required for SMAP, MODIS, Landsat, GPM (see `.env.example`).

## Used by the Simulator (verified 2026-11-14)

| Source | Use | Where |
|---|---|---|
| NASA POWER daily point API, community `AG` | Weather 2001-2025: Tmax, Tmin, precipitation, solar, RH, wind | `data/samples/power_daily_story_county_ia_2001_2025.csv`; live fetch in `simulator/ports.py` |
| ISRIC SoilGrids v2.0 REST API | Sand, clay, organic carbon, pH at the demo farm | `data/samples/soilgrids_story_county_ia.json` |
| FAO-56 (Allen et al. 1998) | Crop coefficients, stage lengths, rooting depth, Ky, soil water table | `simulator/parameters.py` |
| USDA NASS county yields via ISU Ag Decision Maker A1-12 | Story County maize 2001-2025, soybean 2016-2025, for calibration | `data/samples/nass_story_county_yields.csv` |
| ISU Ag Decision Maker A1-20 (2026) | Iowa production costs and budget yields | `simulator/parameters.py` |
| USDA WASDE, November 2026 | 2026/27 projected farm prices | `simulator/parameters.py` |
| NASA NEX-GDDP-CMIP6 v2.0 (NCCS THREDDS) | Monthly temperature and rain changes, 6 models, 2 SSPs, 2050s/2080s | `data/samples/nex_gddp_cmip6_story_county_ia.json`; `simulator/projections.py` |
| Zhao et al. (2017) PNAS; Schlenker & Roberts (2009) PNAS | Published US crop response to warming | `simulator/parameters.py` |
| Practical Farmers of Iowa; Iowa State University | Cover crop effects and costs | `simulator/parameters.py` |

The NASS Quick Stats API needs a free key; the county yields above were transcribed from ISU's
published tables instead.

## Used by CropDoctor (verified 2026-11-14)

| Source | Use | Where |
|---|---|---|
| MODIS MOD13Q1 and MYD13Q1 v061, 16-day NDVI at 250 m, via Microsoft Planetary Computer | Field greenness 2000-2026: five points per demo field, good and marginal pixels only | `data/samples/modis_ndvi_demo_fields.csv`; built by `cropdoctor/fetch_samples.py` |
| USDA NASS Cropland Data Layer 2008-2021, via Microsoft Planetary Computer | Crop grown in each demo field each year, to check the greenness curve is a crop's | `data/samples/usda_cdl_demo_fields.csv` |
| NASA POWER daily point API, community `AG` | Weather for the same cell as the Simulator sample, 2026 to date (2001-2025 is the Simulator's file) | `data/samples/power_daily_story_county_ia_2026.csv` |

MODIS, Landsat and the crop map need no Earthdata login when read through Planetary Computer.
