import { CloudSun, FlaskConical, RefreshCw, Sprout } from "lucide-react";
import { useState } from "react";
import { KindTag, SegmentedTabs, Skeleton } from "../../../shared/components";
import { scenarioSummary } from "../lib/format";
import type { useSimulator } from "../state/useSimulator";
import type { SimulatorOptions } from "../types";
import { AssumptionsList } from "./AssumptionsList";
import { ChangeVsToday } from "./ChangeVsToday";
import { ClimateCompare } from "./ClimateCompare";
import { IndicatorBars } from "./IndicatorBars";
import { RecommendationBlock } from "./RecommendationBlock";
import { SavedRuns } from "./SavedRuns";
import { SeasonTable } from "./SeasonTable";
import { WeatherYearsChart } from "./WeatherYearsChart";

type Tab = "compare" | "seasons" | "assumptions" | "saved";
type Sim = ReturnType<typeof useSimulator>;

/** Right panel: recommendation first, then the evidence behind it. */
export function ResultsPanel({ options, sim }: { options: SimulatorOptions; sim: Sim }) {
  const [tab, setTab] = useState<Tab>("compare");
  const { state, stale, actions, draft } = sim;
  const result = state.result;

  const savedSection = (
    <SavedRuns runs={state.savedRuns} error={state.savedError} canSave={!!result && !stale}
      defaultName={draft ? scenarioSummary(draft.scenario).slice(0, 2).join(", ") : "Run"}
      onSave={actions.save} onOpen={(id) => { void actions.openSaved(id); setTab("compare"); }}
      onDelete={(id) => void actions.deleteSaved(id)} />
  );

  if (!result) {
    return (
      <div className="scroll-thin h-full overflow-y-auto p-[18px]">
        {state.running ? <ResultsSkeleton /> : <Intro />}
        <div className="mt-6 border-t border-line pt-4">{savedSection}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className={stale || state.running ? "opacity-55 transition-opacity" : "transition-opacity"}>
          <RecommendationBlock result={result} />
        </div>
        {stale && !state.running && (
          <button type="button" onClick={() => void actions.run()}
            className="mx-[18px] mt-3 flex w-[calc(100%-36px)] items-center gap-2 rounded-chip border border-line bg-glass-hi px-3 py-2 text-left text-[13px] font-semibold text-tx hover:bg-glass-sel">
            <RefreshCw size={14} strokeWidth={1.75} className="text-lime" />
            Inputs changed since this result. Run again to update.
          </button>
        )}
        <div className="sticky top-0 z-10 bg-[rgb(16_20_18/.85)] px-[18px] py-3 backdrop-blur-md">
          <SegmentedTabs<Tab> label="Result views" size="sm" value={tab} onChange={setTab}
            items={[{ id: "compare", label: "Compare" }, { id: "seasons", label: "Seasons" },
              { id: "assumptions", label: "Assumptions" }, { id: "saved", label: "Saved" }]} />
        </div>
        <div className={`space-y-6 px-[18px] pb-5 ${stale || state.running ? "opacity-55" : ""}`}>
          {tab === "compare" && (
            <>
              <ChangeVsToday result={result} />
              <ClimateCompare result={result} />
              <IndicatorBars result={result} />
              <WeatherYearsChart result={result} />
            </>
          )}
          {tab === "seasons" && <SeasonTable result={result} crops={options.crops} />}
          {tab === "assumptions" && <AssumptionsList result={result} />}
          {tab === "saved" && savedSection}
        </div>
      </div>
      <p className="border-t border-line px-[18px] py-2.5 text-[12px] leading-snug text-mut">
        {result.calibrated ? "Demo farm with sample data. " : ""}Weather is observed (NASA POWER); everything else here is modelled.
      </p>
    </div>
  );
}

function Intro() {
  const steps = [
    { icon: Sprout, title: "Pick rotations", text: "Up to four crop sequences for one field." },
    { icon: CloudSun, title: "Set a scenario", text: "Shift 25 years of observed NASA POWER weather: hotter, drier, irrigated." },
    { icon: FlaskConical, title: "Compare", text: "Each rotation is replayed over every weather year and ranked by your priorities." },
  ];
  return (
    <div>
      <h2 className="text-[21px] font-bold tracking-[-.01em]">Test a rotation before you plant it</h2>
      <p className="mt-2 text-sm leading-normal text-mut">
        The simulator compares crop rotations on one field under a climate scenario you choose.
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl border border-line bg-glass-hi">
              <s.icon size={17} strokeWidth={1.75} className="text-lime" />
            </span>
            <span>
              <span className="block text-sm font-bold">{i + 1}. {s.title}</span>
              <span className="block text-[13px] leading-snug text-mut">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 space-y-2 border-t border-line pt-4 text-[13px] leading-snug text-mut">
        <p className="flex flex-wrap items-center gap-1.5"><KindTag kind="observed" /> NASA POWER weather and SoilGrids soil.</p>
        <p className="flex flex-wrap items-center gap-1.5"><KindTag kind="scenario" /> What you change. A what-if, not a forecast.</p>
        <p className="flex flex-wrap items-center gap-1.5"><KindTag kind="modelled" /> Results: estimates from FAO crop-water rules, calibrated to county yields.</p>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Running the simulation">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-7 w-full" />
      <Skeleton className="mt-2 h-7 w-3/4" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    </div>
  );
}
