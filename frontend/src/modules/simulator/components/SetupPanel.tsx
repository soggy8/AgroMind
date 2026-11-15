import { Droplets, Loader2, Play } from "lucide-react";
import { useEffect } from "react";
import { Button, FieldRow } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import type { Sim } from "../state/useSimulator";
import type { SimulatorOptions } from "../types";
import { PriorityControls } from "./PriorityControls";
import { RotationBuilder } from "./RotationBuilder";
import { ScenarioControls } from "./ScenarioControls";
import { t } from "../../../shared/i18n";

/** Left panel: field, rotations, scenario, priorities, and the one primary action. */
export function SetupPanel({ options, sim, onSuggest, onIrrigation }: {
  options: SimulatorOptions;
  sim: Sim;
  onSuggest: () => void;
  onIrrigation: () => void;
}) {
  const u = useUnits();
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
  const cropName = (id: string | null) => (id ? options.crops.find((c) => c.id === id)?.name ?? id : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-[18px] pb-4 pt-[18px]">
        <section aria-labelledby="field-h" data-tour="field" data-assist="sim.field">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="field-h" className="text-[15px] font-bold">{t("Field")}</h2>
            <span className="text-[13px] text-mut">{t("{length} fields", { length: options.fields.length })}</span>
          </div>
          <div className="space-y-1" role="radiogroup" aria-label={t("Field to simulate")}>
            {options.fields.map((f) => (
              <FieldRow key={f.id} radio name={f.name} shape={f.boundary} ndviStep={null}
                meta={`${f.crop_id ? t("Now {crop}", { crop: cropName(f.crop_id)!.toLowerCase() }) : t("No current crop")} · ${f.soil.replace(" (SoilGrids)", "")}`}
                value={u.area(f.area_ha)} selected={f.id === draft.fieldId} onSelect={() => actions.setField(f.id)} />
            ))}
          </div>
          {field && (
            <p className="mt-2 text-[12px] leading-snug text-mut">
              {t("Soil: {soil}.{v}", { soil: field.soil, v: " " })}
              {field.crop_id
                ? t("Rotations start after this season's {toLowerCase}.", { toLowerCase: cropName(field.crop_id)!.toLowerCase() })
                : t("No current crop recorded, so the first season has no rotation effect.")}
            </p>
          )}
        </section>

        <div className="border-t border-line" />
        <RotationBuilder rotations={draft.rotations} crops={options.crops} onCrops={actions.setCrops}
          onCoverCrop={actions.setCoverCrop} onAdd={() => actions.addRotation()} onRemove={actions.removeRotation}
          onSuggest={onSuggest} />
        <div className="border-t border-line" />
        <ScenarioControls scenario={draft.scenario} presets={options.scenario_presets} projections={options.projections}
          economics={draft.includeEconomics} onChange={actions.setScenario} />
        <div className="border-t border-line" />
        <PriorityControls priorities={draft.priorities} economics={draft.includeEconomics}
          onChange={actions.setPriority} onEconomics={actions.setEconomics} />
      </div>

      <div className="space-y-2 border-t border-line p-[14px]">
        {state.runError && (
          <p role="alert" className="text-[13px] leading-snug text-alert">{state.runError}</p>
        )}
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1 !py-3" onClick={() => void actions.run()} disabled={state.running} data-tour="run" data-assist="sim.run">
            {state.running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} strokeWidth={2} />}
            {state.running ? t("Running 25 weather years…") : t("Run simulation")}
          </Button>
          <Button onClick={onIrrigation} title={t("Irrigation planner")} aria-label={t("Irrigation planner")} className="!px-3">
            <Droplets size={17} strokeWidth={1.75} className="text-water" />
          </Button>
        </div>
      </div>
    </div>
  );
}
