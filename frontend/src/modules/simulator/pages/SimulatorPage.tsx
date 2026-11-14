import { AlertTriangle, MessageSquareText, RefreshCw } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { TopBar } from "../../../app/TopBar";
import type { Route } from "../../../app/route";
import { Button, Glass, KindTag, SegmentedTabs, Skeleton } from "../../../shared/components";
import { FarmMap, type MapInsets } from "../../../shared/map/FarmMap";
import { AdvisorDrawer } from "../components/AdvisorDrawer";
import { ResultsPanel } from "../components/ResultsPanel";
import { SetupPanel } from "../components/SetupPanel";
import { scenarioSummary } from "../lib/format";
import { useSimulator } from "../state/useSimulator";

const FARM_ID = "demo";
const DESKTOP = "(min-width: 1024px)";
const DESKTOP_INSETS: MapInsets = { left: 370, right: 430, top: 94, bottom: 20 };
const STACKED_INSETS: MapInsets = { left: 0, right: 0, top: 0, bottom: 0 };

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
  );
}

/** Farm Simulator: the Command Center shell (top bar + floating panels over the map). */
export function SimulatorPage({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const sim = useSimulator(FARM_ID);
  const { state, draft } = sim;
  const options = state.options;
  const desktop = useMedia(DESKTOP);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [sheet, setSheet] = useState<"setup" | "results">("setup");
  const closeAdvisor = useCallback(() => setAdvisorOpen(false), []);

  const runAndShow = () => {
    void sim.actions.run();
    if (!desktop) setSheet("results");
  };

  const topBar = (
    <TopBar route={route} onNavigate={onNavigate} farmName={options?.farm.name ?? "Demo Farm"}
      region={options?.farm.region ?? "Story County, Iowa"}
      actions={
        <Button onClick={() => setAdvisorOpen(true)}>
          <MessageSquareText size={16} strokeWidth={1.75} />
          <span className="hidden whitespace-nowrap lg:inline">Ask the advisor</span>
        </Button>
      } />
  );

  if (state.loadError) {
    return (
      <div className="flex min-h-full flex-col">
        {topBar}
        <main className="grid flex-1 place-items-center p-6">
          <Glass className="max-w-md p-6">
            <h1 className="flex items-center gap-2 text-[19px] font-bold"><AlertTriangle size={20} className="text-alert" /> Couldn&apos;t load the simulator</h1>
            <p className="mt-2 text-sm text-mut">{state.loadError}</p>
            <Button className="mt-4" onClick={() => location.reload()}><RefreshCw size={15} /> Try again</Button>
          </Glass>
        </main>
      </div>
    );
  }

  const fields = options?.fields.map((f) => ({
    id: f.id, name: f.name, boundary: f.boundary,
    chip: `${options.crops.find((c) => c.id === f.crop_id)?.name ?? f.crop_id} · ${f.area_ha} ha`,
  })) ?? [];

  const map = options && (
    <FarmMap fields={fields} selectedId={draft?.fieldId} onSelect={sim.actions.setField} center={options.farm.center}
      insets={desktop ? DESKTOP_INSETS : STACKED_INSETS} />
  );

  const scenarioPill = draft && (
    <div className="glass flex flex-wrap items-center gap-x-2 gap-y-1 !rounded-[13px] px-3 py-2 text-[13px] font-semibold">
      <KindTag kind="scenario" />
      {scenarioSummary(draft.scenario).map((p, i) => (
        <span key={p} className={i ? "text-mut" : ""}>{i > 0 && <span className="mr-2 text-mut/60">·</span>}{p}</span>
      ))}
    </div>
  );

  const sourcePill = options && (
    <div className="glass !rounded-[10px] px-[11px] py-[6px] text-[12px]">
      Imagery © Esri · Weather NASA POWER 2001–2025 · Soil SoilGrids
    </div>
  );

  const setup = options ? <SetupPanel options={options} sim={{ ...sim, actions: { ...sim.actions, run: async () => runAndShow() } }} /> : <PanelSkeleton />;
  const results = options ? <ResultsPanel options={options} sim={sim} /> : <PanelSkeleton />;

  return (
    <div className={desktop ? "relative h-full overflow-hidden" : "flex min-h-full flex-col"}>
      {desktop ? (
        <>
          {map}
          <div className="absolute inset-x-0 top-0 z-20">{topBar}</div>
          <Glass as="aside" aria-label="Simulation set-up" className="anim-in absolute bottom-5 left-5 top-[94px] z-10 w-[350px] overflow-hidden">
            {setup}
          </Glass>
          <Glass as="aside" aria-label="Simulation results" className="anim-in absolute bottom-5 right-5 top-[94px] z-10 w-[410px] overflow-hidden">
            {results}
          </Glass>
          <div className="absolute left-[390px] right-[450px] top-[94px] z-10 flex justify-center">{scenarioPill}</div>
          <div className="absolute bottom-5 right-[450px] z-10">{sourcePill}</div>
        </>
      ) : (
        <>
          {topBar}
          <div className="relative mx-4 mt-3 h-[42vh] min-h-[260px] overflow-hidden rounded-panel border border-line">
            {map}
            <div className="absolute bottom-2 left-2 right-2 z-[500]">{scenarioPill}</div>
          </div>
          <Glass as="section" className="mx-4 mb-4 mt-3 flex min-h-[70vh] flex-col overflow-hidden">
            <div className="border-b border-line p-2.5">
              <SegmentedTabs label="Simulator views" value={sheet} onChange={setSheet}
                items={[{ id: "setup", label: "Set up" }, { id: "results", label: "Results" }]} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{sheet === "setup" ? setup : results}</div>
          </Glass>
          <div className="mx-4 mb-4 text-[12px] text-mut">Imagery © Esri · Weather NASA POWER · Soil SoilGrids</div>
        </>
      )}
      {advisorOpen && <AdvisorDrawer farmId={FARM_ID} result={state.result} onClose={closeAdvisor} />}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 p-[18px]" aria-busy="true">
      <Skeleton className="h-5 w-24" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      <Skeleton className="mt-6 h-5 w-32" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}
