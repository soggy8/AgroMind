import { AlertTriangle, RefreshCw } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { TopBar } from "../../../app/TopBar";
import type { Route } from "../../../app/route";
import { Button, Glass, KindTag, SegmentedTabs, Skeleton, StatusPill, Tour, tourSeen, type TourStep } from "../../../shared/components";
import { useMedia } from "../../../shared/hooks/useMedia";
import { FarmMap, type MapInsets } from "../../../shared/map/FarmMap";
import { type ImageryCapture, imageryCredit, ImageryDateWatcher } from "../../../shared/map/ImageryDate";
import { useUnits } from "../../../shared/units";
import { ReportView } from "../components/ReportView";
import { ResultsPanel } from "../components/ResultsPanel";
import { SetupPanel } from "../components/SetupPanel";
import { signed } from "../lib/format";
import { useAssistantBridge } from "../state/useAssistantBridge";
import { useSimulator } from "../state/useSimulator";
import type { ProjectionInfo, Scenario } from "../types";
import { t as tr, tn as trn } from "../../../shared/i18n";

// Drawers load on first open; the irrigation planner pulls in the chart library.
const FinderDrawer = lazy(() => import("../components/FinderDrawer").then((m) => ({ default: m.FinderDrawer })));
const IrrigationDrawer = lazy(() => import("../components/IrrigationDrawer").then((m) => ({ default: m.IrrigationDrawer })));
const CompareRunsDrawer = lazy(() => import("../components/CompareRunsDrawer").then((m) => ({ default: m.CompareRunsDrawer })));

const DESKTOP = "(min-width: 1024px)";
const DESKTOP_INSETS: MapInsets = { left: 370, right: 430, top: 94, bottom: 20 };
const STACKED_INSETS: MapInsets = { left: 0, right: 0, top: 0, bottom: 0 };
const TOUR_ID = "simulator-v1";

const TOUR: TourStep[] = [
  { target: "field", title: tr("Pick a field"), body: tr("Each field has its own soil from SoilGrids and its current crop, which the first season follows.") },
  { target: "rotations", title: tr("Choose rotations to compare"), body: tr("Up to four crop sequences. Add a rye cover crop to any of them.") },
  { target: "finder", title: tr("Or let AgroMind suggest"), body: tr("It tries every rotation of up to three crops and ranks them for your priorities.") },
  { target: "scenario", title: tr("Set the climate"), body: tr("Shift today's weather yourself, or use NASA climate-model projections for the 2050s or 2080s.") },
  { target: "run", title: tr("Run it"), body: tr("Each rotation is replayed over 25 years of real NASA weather, so you see good and bad years alike.") },
  { target: "results", title: tr("Read the results"), body: tr("The best rotation for your priorities comes first, with the evidence and trade-offs below. Replay any year, compare saved runs, or print a report.") },
];

type DrawerState = null | "finder" | "irrigation" | { compare: [string, string] };

function scenarioParts(s: Scenario, projections: ProjectionInfo[], u: ReturnType<typeof useUnits>): string[] {
  const p = s.projection ? projections.find((x) => x.id === s.projection) : null;
  const climate = p
    ? [`NASA ${p.ssp_name.split(" (")[1]?.replace(")", "") ?? p.ssp}`, p.period]
    : [u.tempDelta(s.temp_delta_c), tr("{v}% rain", { v: signed(s.rain_change_pct) })];
  const irrigation = s.irrigation === "none" ? tr("rain-fed") : s.irrigation === "full" ? tr("full irrigation")
    : tr("irrigation ≤ {v}", { v: u.water(s.irrigation_cap_mm ?? 0) });
  return [...climate, irrigation, trn(s.years, "{n} year", "{n} years")];
}

/** Farm Simulator: the Command Center shell (top bar + floating panels over the map). */
export function SimulatorPage({ farmId, route, onNavigate }: { farmId: string; route: Route; onNavigate: (r: Route) => void }) {
  const sim = useSimulator(farmId);
  const u = useUnits();
  const { state, draft } = sim;
  const options = state.options;
  const desktop = useMedia(DESKTOP);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [touring, setTouring] = useState(false);
  const [sheet, setSheet] = useState<"setup" | "results">("setup");
  const [imagery, setImagery] = useState<ImageryCapture | "error" | null>(null);
  const close = useCallback(() => setDrawer(null), []);
  const endTour = useCallback(() => setTouring(false), []);
  // Phones show set-up and results on separate sheets: after the assistant runs, show the results.
  useAssistantBridge(sim, () => { if (!desktop) setSheet("results"); });

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

  const pageTitle = <h1 className="sr-only">{tr("Farm Simulator")}</h1>;

  const topBar = (
    <TopBar route={route} onNavigate={onNavigate}
      status={sim.stale && <StatusPill tone="watch">{tr("Results out of date")}</StatusPill>}
      onHelp={() => { if (!desktop) setSheet("setup"); setTouring(true); }} />
  );

  if (state.loadError) {
    return (
      <div className="flex min-h-full flex-col">
        {topBar}
        <main className="grid flex-1 place-items-center p-6">
          <Glass className="max-w-md p-6">
            <h1 className="flex items-center gap-2 text-[19px] font-bold"><AlertTriangle size={20} className="text-alert" /> {tr("Couldn't load the simulator")}</h1>
            <p className="mt-2 text-sm text-mut">{state.loadError}</p>
            <Button className="mt-4" onClick={() => location.reload()}><RefreshCw size={15} /> {tr("Try again")}</Button>
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
            <h1 className="text-[21px] font-bold tracking-[-.01em]">{tr("Draw your first field")}</h1>
            <p className="mt-2 text-sm leading-normal text-mut">
              {tr("{name} has no fields yet. Add one in the farm profile, then come back to compare rotations on it.", { name: options.farm.name })}
            </p>
            <Button variant="primary" className="mt-5" onClick={() => onNavigate("farm-profile")}>{tr("Open farm profile")}</Button>
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
      insets={desktop ? DESKTOP_INSETS : STACKED_INSETS} startOnGlobe={options.farm.id === "demo"} globeLabel={options.farm.name}>
      <ImageryDateWatcher onChange={setImagery} />
    </FarmMap>
  );

  const scenarioPill = draft && options && (
    <div className="glass flex flex-wrap items-center gap-x-2 gap-y-1 !rounded-[13px] px-3 py-2 text-[13px] font-semibold">
      <KindTag kind="scenario" />
      {scenarioParts(draft.scenario, options.projections, u).map((p, i) => (
        <span key={p} className={i ? "text-mut" : ""}>{i > 0 && <span className="mr-2 text-mut/60">·</span>}{p}</span>
      ))}
    </div>
  );

  const source = tr("{imageryCredit} · Weather NASA POWER 2001–2025 · Soil ISRIC SoilGrids v2.0", { imageryCredit: imageryCredit(imagery) });
  const sourcePill = options && <div className="glass max-w-full !rounded-[10px] px-[11px] py-[6px] text-[12px] leading-snug">{source}</div>;

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
            <main aria-label={tr("Farm map")} className="absolute inset-0">
              {pageTitle}
              {map}
              <div className="absolute left-[390px] right-[450px] top-[94px] z-10 flex justify-center">{scenarioPill}</div>
              <div className="absolute bottom-5 left-[390px] right-[450px] z-10 flex justify-end">{sourcePill}</div>
            </main>
            <div className="absolute inset-x-0 top-0 z-20">{topBar}</div>
            <Glass as="aside" aria-label={tr("Simulation set-up")} className="anim-in absolute bottom-5 left-5 top-[94px] z-10 w-[350px] overflow-hidden">
              {setup}
            </Glass>
            <Glass as="aside" aria-label={tr("Simulation results")} data-tour="results"
              className="anim-in absolute bottom-5 right-5 top-[94px] z-10 w-[410px] overflow-hidden">
              {results}
            </Glass>
          </>
        ) : (
          <>
            {topBar}
            <main aria-label={tr("Farm map")} className="relative isolate mx-4 mt-3 block h-[42vh] min-h-[260px] overflow-hidden rounded-panel border border-line">
              {pageTitle}
              {map}
              <div className="absolute bottom-2 left-2 right-2 z-[500]">{scenarioPill}</div>
            </main>
            <Glass as="section" aria-label={tr("Simulation")} className="mx-4 mb-4 mt-3 flex min-h-[70vh] flex-col overflow-hidden">
              <div className="border-b border-line p-2.5">
                <SegmentedTabs label={tr("Simulator views")} value={sheet} onChange={setSheet} className="[&>button]:min-h-11"
                  items={[{ id: "setup", label: tr("Set up") }, { id: "results", label: tr("Results") }]} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col" data-tour={sheet === "results" ? "results" : undefined}>
                {sheet === "setup" ? setup : results}
              </div>
            </Glass>
            <footer className="mx-4 mb-4 text-[12px] text-mut">{source}</footer>
          </>
        )}
        <Suspense fallback={null}>
          {drawer === "finder" && <FinderDrawer sim={sim} onClose={close} />}
          {drawer === "irrigation" && <IrrigationDrawer sim={sim} onClose={close} />}
          {drawer && typeof drawer === "object" && <CompareRunsDrawer farmId={farmId} runIds={drawer.compare} onClose={close} />}
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
