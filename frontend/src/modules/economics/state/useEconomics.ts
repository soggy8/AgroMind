import { useCallback, useEffect, useRef, useState } from "react";
import { simulatorApi } from "../../simulator/api/simulatorApi";
import type { FieldOption, ProjectionInfo } from "../../simulator/types";
import { economicsApi } from "../api/economicsApi";
import type {
  EconomicsDefaults, EconomicsReport, EconomicsRequest, EconScenario, HeatResponse, Land, RotationInput, Units,
} from "../types";

const LB_PER_BU: Record<string, number> = { maize: 56, soybean: 60, oats: 32 };
const HA_PER_ACRE = 0.40468564;

/** USD per bushel to USD per tonne (USDA standard bushel weights). */
export const perBuToPerT = (usdBu: number, crop: string) => usdBu / ((LB_PER_BU[crop] * 0.45359237) / 1000);
export const perTToPerBu = (usdT: number, crop: string) => usdT * ((LB_PER_BU[crop] * 0.45359237) / 1000);
/** USD per acre to USD per hectare. */
export const perAcToPerHa = (usdAc: number) => usdAc / HA_PER_ACRE;
export const perHaToPerAc = (usdHa: number) => usdHa * HA_PER_ACRE;

export interface Draft {
  fieldId: string;
  rotations: RotationInput[];
  yoursId: string;
  source: "projection" | "sliders";
  projection: string | null;
  temp: number;
  rain: number;
  heat: HeatResponse;
  priceChange: number;
  land: Land;
  /** The farmer's own numbers as typed, in display units (per bu or t, per ac or ha); empty = default. */
  prices: Record<string, string>;
  costs: Record<string, string>;
  rent: string;
}

/** Turn typed text into a number; empty or invalid gives null (use the default). */
const num = (s: string | undefined) => {
  if (s === undefined || s.trim() === "") return null;
  const v = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? v : null;
};

export function buildRequest(d: Draft, system: Units): EconomicsRequest {
  const us = system === "us";
  const yours = d.rotations.find((r) => r.id === d.yoursId);
  const ordered = yours ? [yours, ...d.rotations.filter((r) => r.id !== d.yoursId)] : d.rotations;
  const prices: Record<string, number> = {};
  const costs: Record<string, number> = {};
  for (const crop of Object.keys(LB_PER_BU)) {
    const p = num(d.prices[crop]);
    if (p !== null && p > 0) prices[crop] = us ? perBuToPerT(p, crop) : p;
    const c = num(d.costs[crop]);
    if (c !== null && c >= 0) costs[crop] = us ? perAcToPerHa(c) : c;
  }
  const rent = num(d.rent);
  const scenario: EconScenario = {
    temp_delta_c: d.source === "projection" ? 0 : d.temp,
    rain_change_pct: d.source === "projection" ? 0 : d.rain,
    irrigation: "none", irrigation_cap_mm: null, years: 5,
    projection: d.source === "projection" ? d.projection : null,
    heat_response: d.heat,
  };
  return {
    field_id: d.fieldId, rotations: ordered, scenario, price_change_pct: d.priceChange, price_crop: null,
    your_numbers: {
      land: d.land, rent_usd_ha: d.land === "rent" && rent !== null && rent >= 0 ? (us ? perAcToPerHa(rent) : rent) : null,
      prices_usd_t: prices, costs_before_rent_usd_ha: costs, irrigation_usd_per_mm_ha: null, cover_crop_usd_ha: null,
    },
    grid: { warming_c: [0, 1, 2, 3, 4], price_change_pct: [-30, -15, 0, 15, 30] },
    units: system,
  };
}

interface State {
  fields: FieldOption[];
  projections: ProjectionInfo[];
  defaults: EconomicsDefaults | null;
  loadError: string | null;
  report: EconomicsReport | null;
  /** The rotations in the order the report was asked for: colours follow this order. */
  reportRotations: RotationInput[];
  running: boolean;
  runError: string | null;
}

/** Loads the field list, projections and default money numbers, then runs a first report on the defaults. */
export function useEconomics(farmId: string, system: Units) {
  const [s, setS] = useState<State>({
    fields: [], projections: [], defaults: null, loadError: null, report: null, reportRotations: [], running: false,
    runError: null,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const runCtl = useRef<AbortController | null>(null);

  const run = useCallback(async (d: Draft) => {
    runCtl.current?.abort();
    const ctl = new AbortController();
    runCtl.current = ctl;
    setS((x) => ({ ...x, running: true, runError: null }));
    try {
      const req = buildRequest(d, system);
      const report = await economicsApi.report(farmId, req, ctl.signal);
      setS((x) => ({ ...x, report, reportRotations: req.rotations ?? [], running: false }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setS((x) => ({ ...x, running: false, runError: (e as Error).message }));
    }
  }, [farmId, system]);

  useEffect(() => {
    const ctl = new AbortController();
    Promise.all([simulatorApi.getOptions(farmId, ctl.signal), economicsApi.defaults(farmId, ctl.signal)])
      .then(([options, defaults]) => {
        const field = options.fields[0];
        if (!field) {
          setS((x) => ({ ...x, loadError: "This farm has no fields yet. Draw one in the farm profile." }));
          return;
        }
        const proj = options.projections.find((p) => p.id === "ssp245_2050s") ?? options.projections[0] ?? null;
        const first: Draft = {
          fieldId: field.id, rotations: defaults.suggested_rotations, yoursId: defaults.default_yours_rotation_id,
          source: proj ? "projection" : "sliders", projection: proj?.id ?? null, temp: 2, rain: 0, heat: "published",
          priceChange: 0, land: "rent", prices: {}, costs: {}, rent: "",
        };
        setS((x) => ({ ...x, fields: options.fields, projections: options.projections, defaults }));
        setDraft(first);
        void run(first);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setS((x) => ({ ...x, loadError: (e as Error).message }));
      });
    return () => ctl.abort();
    // First load only: later runs come from the controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  useEffect(() => () => runCtl.current?.abort(), []);

  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d)), []);
  return { state: s, draft, patch, run: () => draft && run(draft) };
}
