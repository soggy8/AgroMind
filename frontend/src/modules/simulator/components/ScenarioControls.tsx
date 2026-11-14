import type { ReactNode } from "react";
import { KindTag, SegmentedTabs } from "../../../shared/components";
import { signed } from "../lib/format";
import type { IrrigationMode, Scenario, ScenarioPreset } from "../types";

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

/** Scenario inputs. Everything here is hypothetical, so the section carries the SCENARIO tag. */
export function ScenarioControls({ scenario, presets, economics, onChange }: {
  scenario: Scenario;
  presets: ScenarioPreset[];
  economics: boolean;
  onChange: (patch: Partial<Scenario>) => void;
}) {
  const active = presets.find((p) => p.scenario.temp_delta_c === scenario.temp_delta_c
    && p.scenario.rain_change_pct === scenario.rain_change_pct)?.id;
  return (
    <section aria-labelledby="scenario-h">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="scenario-h" className="text-[15px] font-bold">Climate scenario</h2>
        <KindTag kind="scenario" />
      </div>
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
          value={scenario.temp_delta_c} display={`${signed(scenario.temp_delta_c, 1)} °C`}
          onChange={(v) => onChange({ temp_delta_c: v })} />
        <Slider id="rain" label="Rainfall" color="var(--color-rain)" min={-50} max={30} step={5}
          value={scenario.rain_change_pct} display={`${signed(scenario.rain_change_pct)}%`}
          onChange={(v) => onChange({ rain_change_pct: v })} />
      </div>
      <p className="text-[12px] leading-snug text-mut">
        Shifts every day of 2001–2025 weather. A what-if, not a forecast.
      </p>

      <div className="mt-3">
        <div className="mb-1.5 text-sm font-semibold">Irrigation</div>
        <SegmentedTabs<IrrigationMode> label="Irrigation" size="sm" value={scenario.irrigation}
          items={[{ id: "none", label: "None" }, { id: "limited", label: "Limited" }, { id: "full", label: "Full" }]}
          onChange={(irrigation) => onChange({ irrigation, irrigation_cap_mm: irrigation === "limited" ? (scenario.irrigation_cap_mm ?? 100) : null })} />
        {scenario.irrigation === "limited" && (
          <Slider id="cap" label="Water per season" color="var(--color-water)" min={25} max={400} step={25}
            value={scenario.irrigation_cap_mm ?? 100} display={`${scenario.irrigation_cap_mm ?? 100} mm`}
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
