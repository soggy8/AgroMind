# data

| Path | Purpose |
|---|---|
| `samples/` | Small **committed** extracts for the Story County demo farm and tests (MODIS NDVI, NASA POWER, soil JSON, climate projections, NASS yields). Safe to open in a text editor; cited in [docs/data-sources.md](../docs/data-sources.md). |
| `raw/` | Downloaded source files (git-ignored) |
| `processed/` | Derived or cleaned pipelines (git-ignored) |
| `cache/` | Optional runtime cache for live connector fetches (git-ignored when used) |

Refresh CropDoctor greenness samples after boundary changes:

```bash
cd backend && .venv/bin/python -m app.modules.cropdoctor.fetch_samples
```

Simulator and CropDoctor both read weather and soil samples keyed to the demo farm centroid in Story County, Iowa.