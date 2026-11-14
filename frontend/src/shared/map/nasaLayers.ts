/**
 * NASA layers for the map. Every GIBS id, tile matrix set, legend URL and unit below was read from NASA's own
 * metadata on 2026-11-14, not written by hand:
 *  - layer ids, tile matrix sets, formats and legend URLs: GIBS WMTS capabilities,
 *    https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
 *  - product, version, collection id (conceptId) and resolution: GIBS layer metadata,
 *    https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/<layer id>.json, and the CMR collection record
 *  - units: the layer's GIBS colour map, https://gibs.earthdata.nasa.gov/colormaps/v1.3/<colormap>.xml
 * Kinds follow each product's CMR abstract (see docs/modules/croptwin.md, "NASA layers").
 * Dates are not stored here: they are read live from GIBS DescribeDomains (see gibs.ts).
 */
import type { ValueKind } from "../components";

export interface NasaLayer {
  key: string;
  /** Mission or instrument, as the user knows it. */
  dataset: string;
  label: string;
  kind: ValueKind;
  /** Why this kind: a short quote or paraphrase of the product's own description. */
  kindReason: string;
  product: { shortName: string; version: string; conceptId: string; title: string };
  units: string;
  /** Native pixel size, in km, for the scale note. */
  pixelKm: number;
  pixelText: string;
  /** GIBS: present when NASA serves map tiles for this dataset. `colormap` names the GIBS colour map (from the
   * layer's capabilities metadata link) used to turn a pixel back into NASA's value class. */
  gibs?: { id: string; tileMatrixSet: string; maxNativeZoom: number; legend?: string; colormap?: string };
  /** Extra caveat shown with the legend. */
  note?: string;
}

const LEGENDS = "https://gibs.earthdata.nasa.gov/legends/";

/** The datasets in the "NASA data" menu, in menu order. */
export const NASA_LAYERS: NasaLayer[] = [
  {
    key: "smap-l3",
    dataset: "SMAP",
    label: "Surface soil moisture (satellite)",
    kind: "observed",
    kindReason: "Daily composite of soil moisture retrieved by the SMAP radiometer (SPL3SMP_E description).",
    product: { shortName: "SPL3SMP_E", version: "006", conceptId: "C2938664763-NSIDC_CPRD",
      title: "SMAP Enhanced L3 Radiometer Global and Polar Grid Daily 9 km EASE-Grid Soil Moisture V006" },
    units: "cm³/cm³",
    pixelKm: 9,
    pixelText: "9 km",
    gibs: { id: "SMAP_L3_Passive_Enhanced_Day_Soil_Moisture", tileMatrixSet: "GoogleMapsCompatible_Level6", maxNativeZoom: 6,
      legend: `${LEGENDS}SMAP_Soil_Moisture_H.svg`, colormap: "SMAP_Soil_Moisture" },
    note: "Daytime satellite passes only (the GIBS \"Day\" layer): areas with no pass that day are blank.",
  },
  {
    key: "smap-l4",
    dataset: "SMAP",
    label: "Surface soil moisture (model, gap-free)",
    kind: "modelled",
    kindReason: "Output of the SMAP L4_SM algorithm, a model analysis that assimilates SMAP observations; GIBS labels it \"Model Value-Added\".",
    product: { shortName: "SPL4SMAU", version: "008", conceptId: "C3480440639-NSIDC_CPRD",
      title: "SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Soil Moisture Analysis Update V008" },
    units: "m³/m³",
    pixelKm: 9,
    pixelText: "9 km",
    gibs: { id: "SMAP_L4_Analyzed_Surface_Soil_Moisture", tileMatrixSet: "GoogleMapsCompatible_Level6", maxNativeZoom: 6,
      legend: `${LEGENDS}SMAP_Analyzed_Soil_Moisture_H.svg`, colormap: "SMAP_Analyzed_Soil_Moisture" },
    note: "Snapshot at 12:00 UTC each day.",
  },
  {
    key: "modis-ndvi",
    dataset: "MODIS",
    label: "Vegetation greenness (NDVI)",
    kind: "observed",
    kindReason: "16-day composite vegetation index from MODIS Terra reflectance (MOD13Q1).",
    product: { shortName: "MOD13Q1", version: "061", conceptId: "C1621383370-LPDAAC_ECS",
      title: "MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061" },
    units: "NDVI (no unit)",
    pixelKm: 0.25,
    pixelText: "250 m",
    gibs: { id: "MODIS_Terra_L3_NDVI_16Day", tileMatrixSet: "GoogleMapsCompatible_Level9", maxNativeZoom: 9,
      legend: `${LEGENDS}MODIS_L3_NDVI_H.svg`, colormap: "MODIS_L3_NDVI" },
    note: "Each date is a 16-day composite.",
  },
  {
    key: "imerg",
    dataset: "GPM IMERG",
    label: "Precipitation rate",
    kind: "modelled",
    kindReason: "Estimates from several satellites' microwave sensors, gridded, intercalibrated and merged by the IMERG algorithm (GPM_3IMERGHH description).",
    product: { shortName: "GPM_3IMERGHH", version: "07", conceptId: "C2723754847-GES_DISC",
      title: "GPM IMERG Final Precipitation L3 Half Hourly 0.1 degree x 0.1 degree V07" },
    units: "mm/hr",
    pixelKm: 10,
    pixelText: "0.1° (about 10 km)",
    gibs: { id: "IMERG_Precipitation_Rate", tileMatrixSet: "GoogleMapsCompatible_Level6", maxNativeZoom: 6,
      legend: `${LEGENDS}GPM_Precipitation_Rate_H.svg`, colormap: "GPM_Precipitation_Rate" },
    note: "Clear areas had under 0.1 mm/hr or no data that day (both are transparent in NASA's colour map).",
  },
  {
    key: "hls-landsat",
    dataset: "Landsat (HLS)",
    label: "Field-scale satellite image",
    kind: "observed",
    kindReason: "Surface reflectance measured by Landsat 8/9 OLI (HLSL30).",
    product: { shortName: "HLSL30", version: "2.0", conceptId: "C2021957657-LPCLOUD",
      title: "HLS Landsat Operational Land Imager Surface Reflectance and TOA Brightness Daily Global 30m v2.0" },
    units: "natural-colour image",
    pixelKm: 0.03,
    pixelText: "30 m",
    gibs: { id: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance", tileMatrixSet: "GoogleMapsCompatible_Level12", maxNativeZoom: 12 },
    note: "Landsat doesn't pass every day, and clouds hide the ground: most dates show nothing here.",
  },
  {
    key: "grace",
    dataset: "GRACE / GRACE-FO",
    label: "Water storage change",
    kind: "modelled",
    kindReason: "Monthly anomalies solved from gravity-field changes, with geophysical constraints added during the inversion (JPL Mascon description).",
    product: { shortName: "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06_V2", version: "RL06Mv02", conceptId: "C1938032626-POCLOUD",
      title: "JPL GRACE and GRACE-FO Mascon Ocean, Ice, and Hydrology Equivalent Water Height Coastal Resolution Improvement (CRI) Filtered Release 06 Version 02" },
    units: "cm of water, versus the long-term mean",
    pixelKm: 300,
    pixelText: "3° mascons (hundreds of km)",
    gibs: { id: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI", tileMatrixSet: "GoogleMapsCompatible_Level6",
      maxNativeZoom: 6, legend: `${LEGENDS}GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI_H.svg`,
      colormap: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI" },
    note: "Monthly. NASA's map tiles for this layer stop in July 2022.",
  },
  {
    key: "smap-l4-root",
    dataset: "SMAP",
    label: "Root-zone soil moisture (model)",
    kind: "modelled",
    kindReason: "Output of the SMAP L4_SM algorithm, a model analysis that assimilates SMAP observations; GIBS labels it \"Model Value-Added\".",
    product: { shortName: "SPL4SMAU", version: "008", conceptId: "C3480440639-NSIDC_CPRD",
      title: "SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Soil Moisture Analysis Update V008" },
    units: "m³/m³",
    pixelKm: 9,
    pixelText: "9 km",
    gibs: { id: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", tileMatrixSet: "GoogleMapsCompatible_Level6", maxNativeZoom: 6,
      legend: `${LEGENDS}SMAP_Analyzed_Soil_Moisture_H.svg`, colormap: "SMAP_Analyzed_Soil_Moisture" },
    note: "Water in the root zone (deeper than the surface layer). Snapshot at 12:00 UTC each day.",
  },
  {
    key: "modis-lst",
    dataset: "MODIS",
    label: "Land surface temperature (day)",
    kind: "observed",
    kindReason: "Land surface temperature retrieved from MODIS Terra thermal bands (MOD11_L2, near real time).",
    product: { shortName: "MOD11_L2", version: "6.1NRT", conceptId: "C2007658455-LANCEMODIS",
      title: "MODIS/Terra Land Surface Temperature/Emissivity 5-Min L2 Swath 1km NRT" },
    units: "K",
    pixelKm: 1,
    pixelText: "1 km",
    gibs: { id: "MODIS_Terra_Land_Surface_Temp_Day", tileMatrixSet: "GoogleMapsCompatible_Level7", maxNativeZoom: 7,
      legend: `${LEGENDS}MODIS_Land_Surface_Temp_H.svg`, colormap: "MODIS_Land_Surface_Temp" },
    note: "The ground's skin temperature, not air temperature. Clouds leave gaps.",
  },
  {
    key: "viirs-ndvi",
    dataset: "VIIRS",
    label: "Vegetation greenness (NDVI, newer)",
    kind: "observed",
    kindReason: "Rolling 8-day vegetation index from VIIRS on NOAA-20 (VJ113A4N).",
    product: { shortName: "VJ113A4N", version: "2", conceptId: "C3706771935-LANCEMODIS",
      title: "VIIRS/JPSS1 Vegetation Indices 8-Day L3 Global 500m SIN Grid" },
    units: "NDVI (no unit)",
    pixelKm: 0.5,
    pixelText: "500 m",
    gibs: { id: "VIIRS_NOAA20_NDVI_8Day", tileMatrixSet: "GoogleMapsCompatible_Level8", maxNativeZoom: 8,
      legend: `${LEGENDS}MODIS_NDVI_H.svg`, colormap: "MODIS_NDVI" },
    note: "Each date is a rolling 8-day composite, updated daily: fresher than the MODIS 16-day layer, coarser pixels.",
  },
  {
    key: "hls-sentinel",
    dataset: "Sentinel-2 (HLS)",
    label: "Field-scale satellite image (Sentinel-2)",
    kind: "observed",
    kindReason: "Surface reflectance measured by Sentinel-2 MSI (HLSS30).",
    product: { shortName: "HLSS30", version: "2.0", conceptId: "C2021957295-LPCLOUD",
      title: "HLS Sentinel-2 Multi-spectral Instrument Surface Reflectance Daily Global 30m v2.0" },
    units: "natural-colour image",
    pixelKm: 0.03,
    pixelText: "30 m",
    gibs: { id: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", tileMatrixSet: "GoogleMapsCompatible_Level12", maxNativeZoom: 12 },
    note: "Sentinel-2 adds passes between Landsat ones, but clouds still hide the ground on many dates.",
  },
  {
    key: "ecostress",
    dataset: "ECOSTRESS",
    label: "Evapotranspiration",
    kind: "modelled",
    kindReason: "Evapotranspiration estimated with the PT-JPL model (ECO_L3T_JET collection title).",
    product: { shortName: "ECO_L3T_JET", version: "003", conceptId: "C4057232489-LPCLOUD",
      title: "ECOSTRESS Tiled Evapotranspiration PT-JPL Instantaneous and Daytime L3 Global 70 m v003" },
    units: "",
    pixelKm: 0.07,
    pixelText: "70 m",
    note: "NASA doesn't serve map tiles for ECOSTRESS. Open the data in Earthdata Search instead.",
  },
];

/** A plain sentence about pixel size versus a field (DESIGN.md section 8: no false precision). */
export function scaleNote(l: NasaLayer): string {
  if (l.pixelKm >= 1) {
    return `One ${l.dataset} pixel is ${l.pixelText} across, larger than your fields. This shows the area around the farm, not a field measurement.`;
  }
  if (l.pixelKm >= 0.1) return `Pixels are ${l.pixelText} across, so a field covers only a few of them.`;
  return `Pixels are ${l.pixelText} across, fine enough to see differences within a field.`;
}
