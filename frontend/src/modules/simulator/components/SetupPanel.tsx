import { Loader2, Play } from "lucide-react";
import { useEffect } from "react";
import { Button } from "../../../shared/components";
import type { useSimulator } from "../state/useSimulator";
import type { SimulatorOptions } from "../types";
import { PriorityControls } from "./PriorityControls";
import { RotationBuilder } from "./RotationBuilder";
import { ScenarioControls } from "./ScenarioControls";

type Sim = ReturnType<typeof useSimulator>;

/** Left panel: field, rotations, scenario, priorities, and the one primary action. */
export function SetupPanel({ options, sim }: { options: SimulatorOptions; sim: Sim }) {
  const { draft, actions, state } = sim;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void actions.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  if (!draft) return null;
  const field = options.fields.find((f) => f.id === draft.fieldId);
  const cropName = (id: string) => options.crops.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-[18px] pb-4 pt-[18px]">
        <section aria-labelledby="field-h">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="field-h" className="text-[15px] font-bold">Field</h2>
            <span className="text-[13px] text-mut">{options.fields.length} fields</span>
          </div>
          <div className="space-y-1" role="radiogroup" aria-label="Field to simulate">
            {options.fields.map((f) => {
              const on = f.id === draft.fieldId;
              return (
                <button key={f.id} type="button" role="radio" aria-checked={on} onClick={() => actions.setField(f.id)}
                  className={`flex w-full items-center justify-between rounded-[14px] border px-3 py-2.5 text-left ${
                    on ? "border-white/12 bg-glass-sel" : "border-transparent hover:bg-glass-hi"}`}>
                  <span>
                    <span className="block text-[15px] font-bold">{f.name}</span>
                    <span className="block text-[13px] text-mut">Now {cropName(f.crop_id).toLowerCase()} · {f.area_ha} ha</span>
                  </span>
                  {on && <span className="text-[12px] font-semibold text-mut">{f.soil.replace(" (SoilGrids)", "")}</span>}
                </button>
              );
            })}
          </div>
          {field && (
            <p className="mt-2 text-[12px] leading-snug text-mut">
              Soil: {field.soil}. Rotations start after this season's {cropName(field.crop_id).toLowerCase()}.
            </p>
          )}
        </section>

        <div className="border-t border-line" />
        <RotationBuilder rotations={draft.rotations} crops={options.crops} onCrops={actions.setCrops}
          onAdd={actions.addRotation} onRemove={actions.removeRotation} />
        <div className="border-t border-line" />
        <ScenarioControls scenario={draft.scenario} presets={options.scenario_presets}
          economics={draft.includeEconomics} onChange={actions.setScenario} />
        <div className="border-t border-line" />
        <PriorityControls priorities={draft.priorities} economics={draft.includeEconomics}
          onChange={actions.setPriority} onEconomics={actions.setEconomics} />
      </div>

      <div className="border-t border-line p-[14px]">
        {state.runError && (
          <p role="alert" className="mb-2 text-[13px] leading-snug text-alert">{state.runError}</p>
        )}
        <Button variant="primary" className="w-full !py-3" onClick={() => void actions.run()} disabled={state.running}>
          {state.running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} strokeWidth={2} />}
          {state.running ? "Running 25 weather years…" : "Run simulation"}
        </Button>
      </div>
    </div>
  );
}
