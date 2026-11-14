import { Satellite, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { InfoTip, KindTag, SegmentedTabs } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { signed } from "../lib/format";
import type { HeatResponse, IrrigationMode, ProjectionInfo, Scenario, ScenarioPreset } from "../types";

function Slider({ id, label, value, display, min, max, step, color, onChange, hint }: {
  id: string; label: string; value: number; display: string; min: number; max: number; step: number;
  color: string; onChange: (v: number) => void; hint?: ReactNode;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
          <i aria-hidden className="h-2 w-2 rounded-[3px]" style={{ background: color }} />
          {label}
        </label>
        <output htmlFor={id} className="text-[15px] font-extrabold">{display}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--slider-color" as string]: color }} aria-valuetext={display} />
      {hint && <p className="text-[12px] leading-snug text-mut">{hint}</p>}
    </div>
  );
}

type Source = "sliders" | "projection";

/** Scenario inputs. Everything here is hypothetical, so the section carries the SCENARIO tag. */
export function ScenarioControls({ scenario, presets, projections, economics, onChange }: {
  scenario: Scenario;
  presets: ScenarioPreset[];
  projections: ProjectionInfo[];
  economics: boolean;
  onChange: (patch: Partial<Scenario>) => void;
}) {
  const u = useUnits();
  const source: Source = scenario.projection ? "projection" : "sliders";
  const active = presets.find((p) => p.scenario.temp_delta_c === scenario.temp_delta_c
    && p.scenario.rain_change_pct === scenario.rain_change_pct)?.id;
  const ssps = [...new Map(projections.map((p) => [p.ssp, p.ssp_name])).entries()];
  const periods = [...new Map(projections.map((p) => [p.period, p.years])).entries()];
  const current = projections.find((p) => p.id === scenario.projection) ?? null;
  const [ssp, period] = scenario.projection?.split("_") ?? [ssps[0]?.[0] ?? "", periods[0]?.[0] ?? ""];
  const pick = (s: string, p: string) => onChange({ projection: `${s}_${p}` });

  return (
    <section aria-labelledby="scenario-h" data-tour="scenario">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="scenario-h" className="flex items-center gap-1 text-[15px] font-bold">
          Climate scenario
          <InfoTip label="Climate scenario">
            A what-if applied to 25 years of real NASA POWER weather (2001–2025). Each rotation is replayed over
            every one of those years with the change added, so you see how it copes with good and bad years alike.
          </InfoTip>
        </h2>
        <KindTag kind="scenario" />
      </div>

      {projections.length > 0 && (
        <SegmentedTabs<Source> label="Scenario source" size="sm" value={source} className="mb-2.5"
          items={[
            { id: "sliders", label: <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={13} strokeWidth={1.75} />Set it yourself</span> },
            { id: "projection", label: <span className="inline-flex items-center gap-1.5"><Satellite size={13} strokeWidth={1.75} />NASA projection</span> },
          ]}
          onChange={(s) => onChange({ projection: s === "projection" ? `${ssp}_${period}` : null })} />
      )}

      {source === "projection" && current ? (
        <div className="space-y-2.5">
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-sm font-semibold">
              Emissions path
              <InfoTip label="Emissions path">
                SSP2-4.5 assumes emissions peak around mid-century, roughly today's policies. SSP5-8.5 assumes
                emissions keep rising fast: a high-end stress test, not the most likely future.
              </InfoTip>
            </div>
            <SegmentedTabs label="Emissions path" size="sm" value={ssp}
              items={ssps.map(([id, name]) => ({ id, label: name.split(" (")[0] }))} onChange={(s) => pick(s, period)} />
          </div>
          <div>
            <div className="mb-1.5 text-sm font-semibold">Decade</div>
            <SegmentedTabs label="Decade" size="sm" value={period}
              items={periods.map(([id, years]) => ({ id, label: `${id} (${years})` }))} onChange={(p) => pick(ssp, p)} />
          </div>
          <dl className="grid grid-cols-2 gap-2 rounded-chip border border-line bg-glass-hi p-2.5 text-[13px]">
            <div>
              <dt className="text-[12px] text-mut">Growing-season temperature</dt>
              <dd className="text-[15px] font-extrabold text-heat">{u.tempDelta(current.temp_change_c.median)}</dd>
              <dd className="text-[12px] text-mut">models {u.tempDelta(current.temp_change_c.min)} to {u.tempDelta(current.temp_change_c.max)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-mut">Growing-season rain</dt>
              <dd className="text-[15px] font-extrabold text-rain">{signed(current.rain_change_pct.median)}%</dd>
              <dd className="text-[12px] text-mut">models {signed(current.rain_change_pct.min)}% to {signed(current.rain_change_pct.max)}%</dd>
            </div>
          </dl>
          <p className="text-[12px] leading-snug text-mut">
            Median of {current.models} climate models (NASA NEX-GDDP-CMIP6), month by month, against 1995–2014.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Scenario presets">
            {presets.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === active}
                onClick={() => onChange({ temp_delta_c: p.scenario.temp_delta_c, rain_change_pct: p.scenario.rain_change_pct })}
                className={`rounded-chip border px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  p.id === active ? "border-white/20 bg-glass-sel text-tx" : "border-line text-mut hover:bg-glass-hi hover:text-tx"}`}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Slider id="temp" label="Temperature" color="var(--color-heat)" min={-1} max={5} step={0.5}
              value={scenario.temp_delta_c} display={u.tempDelta(scenario.temp_delta_c)}
              onChange={(v) => onChange({ temp_delta_c: v })} />
            <Slider id="rain" label="Rainfall" color="var(--color-rain)" min={-50} max={30} step={5}
              value={scenario.rain_change_pct} display={`${signed(scenario.rain_change_pct)}%`}
              onChange={(v) => onChange({ rain_change_pct: v })} />
          </div>
          <p className="text-[12px] leading-snug text-mut">
            Shifts every day of 2001–2025 weather. A what-if, not a forecast.
          </p>
        </>
      )}

      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-1 text-sm font-semibold">
          Crops' response to heat
          <InfoTip label="Response to heat">
            Studies across the US find maize loses about 10% of yield per °C of warming (Zhao et al. 2017). This
            county's own 2001–2025 yields barely dropped in hot years, which suggests far less. Your field is
            probably in between, so results always show both.
          </InfoTip>
        </div>
        <SegmentedTabs<HeatResponse> label="Crops' response to heat" size="sm" value={scenario.heat_response}
          items={[{ id: "published", label: "US research" }, { id: "local", label: "This county" }]}
          onChange={(heat_response) => onChange({ heat_response })} />
        <p className="mt-1.5 text-[12px] leading-snug text-mut">
          {scenario.heat_response === "published"
            ? "Published US average: maize loses about 10% per °C of warming."
            : "This county's 2001–2025 yields: far more heat-tolerant than the US average. Optimistic."}
        </p>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-sm font-semibold">Irrigation</div>
        <SegmentedTabs<IrrigationMode> label="Irrigation" size="sm" value={scenario.irrigation}
          items={[{ id: "none", label: "None" }, { id: "limited", label: "Limited" }, { id: "full", label: "Full" }]}
          onChange={(irrigation) => onChange({ irrigation, irrigation_cap_mm: irrigation === "limited" ? (scenario.irrigation_cap_mm ?? 100) : null })} />
        {scenario.irrigation === "limited" && (
          <Slider id="cap" label="Water per season" color="var(--color-water)" min={25} max={400} step={25}
            value={scenario.irrigation_cap_mm ?? 100} display={u.water(scenario.irrigation_cap_mm ?? 100)}
            onChange={(v) => onChange({ irrigation_cap_mm: v })} />
        )}
      </div>

      <Slider id="years" label="Seasons to simulate" color="var(--color-lime)" min={1} max={10} step={1}
        value={scenario.years} display={`${scenario.years} year${scenario.years === 1 ? "" : "s"}`}
        onChange={(v) => onChange({ years: v })} />
      {economics && (
        <Slider id="price" label="Crop prices" color="var(--color-soil)" min={-40} max={40} step={5}
          value={scenario.price_change_pct} display={`${signed(scenario.price_change_pct)}%`}
          onChange={(v) => onChange({ price_change_pct: v })}
          hint="Against 2026/27 USDA projections." />
      )}
    </section>
  );
}
