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
