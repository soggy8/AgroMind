import { AlertTriangle, CircleHelp, MessageSquareText, RefreshCw } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { TopBar } from "../../../app/TopBar";
import type { Route } from "../../../app/route";
import { Button, Glass, KindTag, SegmentedTabs, Skeleton, Tour, tourSeen, type TourStep } from "../../../shared/components";
import { FarmMap, type MapInsets } from "../../../shared/map/FarmMap";
import { type UnitSystem, useUnits } from "../../../shared/units";
import { ReportView } from "../components/ReportView";
import { ResultsPanel } from "../components/ResultsPanel";
import { SetupPanel } from "../components/SetupPanel";
import { signed } from "../lib/format";
import { useSimulator } from "../state/useSimulator";
import type { ProjectionInfo, Scenario } from "../types";

// Drawers load on first open; the irrigation planner pulls in the chart library.
const AdvisorDrawer = lazy(() => import("../components/AdvisorDrawer").then((m) => ({ default: m.AdvisorDrawer })));
const FinderDrawer = lazy(() => import("../components/FinderDrawer").then((m) => ({ default: m.FinderDrawer })));
const IrrigationDrawer = lazy(() => import("../components/IrrigationDrawer").then((m) => ({ default: m.IrrigationDrawer })));
const CompareRunsDrawer = lazy(() => import("../components/CompareRunsDrawer").then((m) => ({ default: m.CompareRunsDrawer })));

const FARM_ID = "demo";
const DESKTOP = "(min-width: 1024px)";
const DESKTOP_INSETS: MapInsets = { left: 370, right: 430, top: 94, bottom: 20 };
const STACKED_INSETS: MapInsets = { left: 0, right: 0, top: 0, bottom: 0 };
const TOUR_ID = "simulator-v1";

const TOUR: TourStep[] = [
  { target: "field", title: "Pick a field", body: "Each field has its own soil from SoilGrids and its current crop, which the first season follows." },
  { target: "rotations", title: "Choose rotations to compare", body: "Up to four crop sequences. Add a rye cover crop to any of them." },
  { target: "finder", title: "Or let AgroMind suggest", body: "It tries every rotation of up to three crops and ranks them for your priorities." },
  { target: "scenario", title: "Set the climate", body: "Shift today's weather yourself, or use NASA climate-model projections for the 2050s or 2080s." },
  { target: "run", title: "Run it", body: "Each rotation is replayed over 25 years of real NASA weather, so you see good and bad years alike." },
  { target: "results", title: "Read the results", body: "The best rotation for your priorities comes first, with the evidence and trade-offs below. Replay any year, compare saved runs, or print a report." },
];

type DrawerState = null | "advisor" | "finder" | "irrigation" | { compare: [string, string] };

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

function scenarioParts(s: Scenario, projections: ProjectionInfo[], u: ReturnType<typeof useUnits>): string[] {
  const p = s.projection ? projections.find((x) => x.id === s.projection) : null;
  const climate = p
    ? [`NASA ${p.ssp_name.split(" (")[1]?.replace(")", "") ?? p.ssp}`, p.period]
    : [u.tempDelta(s.temp_delta_c), `${signed(s.rain_change_pct)}% rain`];
  const irrigation = s.irrigation === "none" ? "rain-fed" : s.irrigation === "full" ? "full irrigation"
    : `irrigation ≤ ${u.water(s.irrigation_cap_mm ?? 0)}`;
  return [...climate, irrigation, `${s.years} year${s.years === 1 ? "" : "s"}`];
}

/** Farm Simulator: the Command Center shell (top bar + floating panels over the map). */
export function SimulatorPage({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const sim = useSimulator(FARM_ID);
  const u = useUnits();
  const { state, draft } = sim;
  const options = state.options;
  const desktop = useMedia(DESKTOP);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [touring, setTouring] = useState(false);
  const [sheet, setSheet] = useState<"setup" | "results">("setup");
  const close = useCallback(() => setDrawer(null), []);
  const endTour = useCallback(() => setTouring(false), []);

  // First visit on a large screen: start the tour once the panels are on screen.
  useEffect(() => {
    if (options && desktop && !tourSeen(TOUR_ID)) {
      const t = setTimeout(() => setTouring(true), 600);
      return () => clearTimeout(t);
    }
  }, [options, desktop]);

  const runAndShow = () => {
    void sim.actions.run();
    if (!desktop) setSheet("results");
  };

  const pageTitle = <h1 className="sr-only">Farm Simulator</h1>;

  const topBar = (
    <TopBar route={route} onNavigate={onNavigate} farmName={options?.farm.name ?? "Demo Farm"}
      region={options?.farm.region ?? undefined}
      actions={
        <>
          <SegmentedTabs<UnitSystem> label="Units" size="sm" value={u.system} onChange={u.setSystem} className="hidden sm:flex"
            items={[{ id: "metric", label: "Metric" }, { id: "us", label: "US" }]} />
          <button type="button" onClick={() => { if (!desktop) setSheet("setup"); setTouring(true); }} aria-label="Take the tour"
            title="Take the tour" className="grid h-10 w-10 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
            <CircleHelp size={18} strokeWidth={1.75} />
          </button>
          <Button onClick={() => setDrawer("advisor")} aria-label="Ask the advisor">
            <MessageSquareText size={16} strokeWidth={1.75} />
            <span className="hidden whitespace-nowrap lg:inline">Ask the advisor</span>
          </Button>
        </>
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

  if (options && options.fields.length === 0) {
    return (
      <div className="flex min-h-full flex-col">
        {topBar}
        <main className="grid flex-1 place-items-center p-6">
          <Glass className="max-w-md p-6">
            <h1 className="text-[21px] font-bold tracking-[-.01em]">Draw your first field</h1>
            <p className="mt-2 text-sm leading-normal text-mut">
              {options.farm.name} has no fields yet. Add one in the farm profile, then come back to compare rotations on it.
            </p>
            <Button variant="primary" className="mt-5" onClick={() => onNavigate("farm-profile")}>Open farm profile</Button>
          </Glass>
        </main>
      </div>
    );
  }

  const fields = options?.fields.map((f) => ({
    id: f.id, name: f.name, boundary: f.boundary,
    chip: `${f.crop_id ? `${options.crops.find((c) => c.id === f.crop_id)?.name ?? f.crop_id} · ` : ""}${u.area(f.area_ha)}`,
  })) ?? [];

  const map = options?.farm.center && (
    <FarmMap fields={fields} selectedId={draft?.fieldId} onSelect={sim.actions.setField} center={options.farm.center}
      insets={desktop ? DESKTOP_INSETS : STACKED_INSETS} />
  );

  const scenarioPill = draft && options && (
    <div className="glass flex flex-wrap items-center gap-x-2 gap-y-1 !rounded-[13px] px-3 py-2 text-[13px] font-semibold">
      <KindTag kind="scenario" />
      {scenarioParts(draft.scenario, options.projections, u).map((p, i) => (
        <span key={p} className={i ? "text-mut" : ""}>{i > 0 && <span className="mr-2 text-mut/60">·</span>}{p}</span>
      ))}
    </div>
  );

  const sourcePill = options && (
    <div className="glass !rounded-[10px] px-[11px] py-[6px] text-[12px]">
      Imagery © Esri · Weather NASA POWER 2001–2025 · Soil SoilGrids
    </div>
  );

  const setup = options
    ? <SetupPanel options={options} sim={{ ...sim, actions: { ...sim.actions, run: async () => runAndShow() } }}
        onSuggest={() => setDrawer("finder")} onIrrigation={() => setDrawer("irrigation")} />
    : <PanelSkeleton />;
  const results = options
    ? <ResultsPanel options={options} sim={sim} onCompare={(ids) => setDrawer({ compare: ids })} onPrint={() => window.print()} />
    : <PanelSkeleton />;

  return (
    <>
      <div className={`print:hidden ${desktop ? "relative h-full overflow-hidden" : "flex min-h-full flex-col"}`}>
        {desktop ? (
          <>
            <main aria-label="Farm map" className="absolute inset-0">
              {pageTitle}
              {map}
              <div className="absolute left-[390px] right-[450px] top-[94px] z-10 flex justify-center">{scenarioPill}</div>
              <div className="absolute bottom-5 right-[450px] z-10">{sourcePill}</div>
            </main>
            <div className="absolute inset-x-0 top-0 z-20">{topBar}</div>
            <Glass as="aside" aria-label="Simulation set-up" className="anim-in absolute bottom-5 left-5 top-[94px] z-10 w-[350px] overflow-hidden">
              {setup}
            </Glass>
            <Glass as="aside" aria-label="Simulation results" data-tour="results"
              className="anim-in absolute bottom-5 right-5 top-[94px] z-10 w-[410px] overflow-hidden">
              {results}
            </Glass>
          </>
        ) : (
          <>
            {topBar}
            <main aria-label="Farm map" className="relative mx-4 mt-3 block h-[42vh] min-h-[260px] overflow-hidden rounded-panel border border-line">
              {pageTitle}
              {map}
              <div className="absolute bottom-2 left-2 right-2 z-[500]">{scenarioPill}</div>
            </main>
            <Glass as="section" aria-label="Simulation" className="mx-4 mb-4 mt-3 flex min-h-[70vh] flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line p-2.5">
                <SegmentedTabs label="Simulator views" value={sheet} onChange={setSheet} className="flex-1"
                  items={[{ id: "setup", label: "Set up" }, { id: "results", label: "Results" }]} />
                <SegmentedTabs<UnitSystem> label="Units" size="sm" value={u.system} onChange={u.setSystem} className="sm:hidden"
                  items={[{ id: "metric", label: "Metric" }, { id: "us", label: "US" }]} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col" data-tour={sheet === "results" ? "results" : undefined}>
                {sheet === "setup" ? setup : results}
              </div>
            </Glass>
            <footer className="mx-4 mb-4 text-[12px] text-mut">Imagery © Esri · Weather NASA POWER · Soil SoilGrids</footer>
          </>
        )}
        <Suspense fallback={null}>
          {drawer === "advisor" && <AdvisorDrawer farmId={FARM_ID} result={state.result} onClose={close} />}
          {drawer === "finder" && <FinderDrawer sim={sim} onClose={close} />}
          {drawer === "irrigation" && <IrrigationDrawer sim={sim} onClose={close} />}
          {drawer && typeof drawer === "object" && <CompareRunsDrawer farmId={FARM_ID} runIds={drawer.compare} onClose={close} />}
        </Suspense>
        {touring && <Tour id={TOUR_ID} steps={TOUR} onClose={endTour} />}
      </div>
      {options && state.result && <ReportView result={state.result} options={options} />}
    </>
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
