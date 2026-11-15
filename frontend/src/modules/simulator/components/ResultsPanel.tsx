import { CloudSun, FileDown, FlaskConical, RefreshCw, Sprout } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { KindTag, SegmentedTabs, Skeleton } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { signed } from "../lib/format";
import type { Sim } from "../state/useSimulator";
import type { SimulatorOptions } from "../types";
import { AssumptionsList } from "./AssumptionsList";
import { ChangeVsToday } from "./ChangeVsToday";
import { ClimateCompare } from "./ClimateCompare";
import { IndicatorBars } from "./IndicatorBars";
import { RecommendationBlock } from "./RecommendationBlock";
import { ReplayView } from "./ReplayView";
import { SavedRuns } from "./SavedRuns";
import { SeasonTable } from "./SeasonTable";
import { t } from "../../../shared/i18n";
// Recharts is only needed once there is a result, so it loads in its own chunk.
const WeatherYearsChart = lazy(() => import("./WeatherYearsChart").then((m) => ({ default: m.WeatherYearsChart })));

type Tab = "compare" | "seasons" | "replay" | "assumptions" | "saved";

/** Right panel: recommendation first, then the evidence behind it. */
export function ResultsPanel({ options, sim, onCompare, onPrint }: {
  options: SimulatorOptions;
  sim: Sim;
  onCompare: (runIds: [string, string]) => void;
  onPrint: () => void;
}) {
  const u = useUnits();
  const [tab, setTab] = useState<Tab>("compare");
  const { state, stale, actions, draft } = sim;
  const result = state.result;
  const driest = result ? [...result.yearly_climate].sort((a, b) => a.rain_mm - b.rain_mm)[0]?.year : undefined;
  const [replayYear, setReplayYear] = useState<number | null>(null);
  useEffect(() => setReplayYear(null), [result]);

  const defaultName = !draft ? t("Run") : draft.scenario.projection
    ? options.projections.find((p) => p.id === draft.scenario.projection)?.ssp_name.split(" (")[0] + `, ${draft.scenario.projection.split("_")[1]}`
    : `${u.tempDelta(draft.scenario.temp_delta_c)}, ${t("{v}% rain", { v: signed(draft.scenario.rain_change_pct) })}`;

  const savedSection = (
    <SavedRuns runs={state.savedRuns} error={state.savedError} canSave={!!result && !stale}
      defaultName={defaultName} onSave={actions.save}
      onOpen={(id) => { void actions.openSaved(id); setTab("compare"); }}
      onDelete={(id) => void actions.deleteSaved(id)} onCompare={onCompare} />
  );

  if (!result) {
    return (
      <div className="scroll-thin h-full overflow-y-auto p-[18px]">
        {state.running ? <ResultsSkeleton /> : <Intro />}
        <div className="mt-6 border-t border-line pt-4">{savedSection}</div>
      </div>
    );
  }

  const year = replayYear ?? driest ?? result.ensemble_start_years[0];

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
            {t("Inputs changed since this result. Run again to update.")}
          </button>
        )}
        <div className="sticky top-0 z-10 bg-[rgb(16_20_18/.85)] px-[18px] py-3 backdrop-blur-md">
          <SegmentedTabs<Tab> label={t("Result views")} size="sm" value={tab} onChange={setTab}
            items={[{ id: "compare", label: t("Compare") }, { id: "seasons", label: t("Seasons") }, { id: "replay", label: t("Replay") },
              { id: "assumptions", label: t("Sources") }, { id: "saved", label: t("Saved") }]} />
        </div>
        <div className={`space-y-6 px-[18px] pb-5 ${stale || state.running ? "opacity-55" : ""}`}>
          {tab === "compare" && (
            <>
              <ChangeVsToday result={result} />
              <ClimateCompare result={result} />
              <IndicatorBars result={result} />
              <Suspense fallback={<Skeleton className="h-[220px] w-full" />}>
                <WeatherYearsChart result={result} onYear={(y) => { setReplayYear(y); setTab("replay"); }} />
              </Suspense>
            </>
          )}
          {tab === "seasons" && <SeasonTable result={result} crops={options.crops} />}
          {tab === "replay" && <ReplayView result={result} crops={options.crops} year={year} onYear={setReplayYear} />}
          {tab === "assumptions" && <AssumptionsList result={result} />}
          {tab === "saved" && savedSection}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-[18px] py-2.5">
        <p className="flex-1 text-[12px] leading-snug text-mut">
          {result.calibrated ? t("Demo farm with sample data. ") : ""}{t("Weather is observed (NASA POWER); everything else is modelled.")}
        </p>
        <button type="button" onClick={onPrint} disabled={stale}
          title={stale ? t("Run again first: the report shows the current result") : t("Print or save as PDF")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-ctl border border-line bg-glass-hi px-2.5 py-1.5 text-[12px] font-semibold hover:bg-glass-sel disabled:opacity-45">
          <FileDown size={14} strokeWidth={1.75} /> {t("Report")}
        </button>
      </div>
    </div>
  );
}

function Intro() {
  const steps = [
    { icon: Sprout, title: t("Pick rotations"), text: t("Up to four crop sequences for one field, or let AgroMind suggest the best.") },
    { icon: CloudSun, title: t("Set a scenario"), text: t("Shift 25 years of observed NASA POWER weather yourself, or use NASA climate-model projections.") },
    { icon: FlaskConical, title: t("Compare"), text: t("Each rotation is replayed over every weather year and ranked by your priorities.") },
  ];
  return (
    <div>
      <h2 className="text-[21px] font-bold tracking-[-.01em]">{t("Test a rotation before you plant it")}</h2>
      <p className="mt-2 text-sm leading-normal text-mut">
        {t("The simulator compares crop rotations on one field under a climate scenario you choose.")}
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl border border-line bg-glass-hi">
              <s.icon size={17} strokeWidth={1.75} className="text-lime" />
            </span>
            <span>
              <span className="block text-sm font-bold">{i + 1}. {t(s.title)}</span>
              <span className="block text-[13px] leading-snug text-mut">{t(s.text)}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 space-y-2 border-t border-line pt-4 text-[13px] leading-snug text-mut">
        <p className="flex flex-wrap items-center gap-1.5"><KindTag kind="observed" /> {t("NASA POWER weather and SoilGrids soil.")}</p>
        <p className="flex flex-wrap items-center gap-1.5"><KindTag kind="scenario" /> {t("What you change. A what-if, not a forecast.")}</p>
        <p className="flex flex-wrap items-center gap-1.5"><KindTag kind="modelled" /> {t("Results: estimates from FAO crop-water rules, calibrated to county yields.")}</p>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label={t("Running the simulation")}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-7 w-full" />
      <Skeleton className="mt-2 h-7 w-3/4" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    </div>
  );
}
