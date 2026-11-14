import { AlertTriangle, MessageSquareText, RefreshCw } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { TopBar } from "../../../app/TopBar";
import type { Route } from "../../../app/route";
import { ndviStep } from "../../../shared/charts/ndvi";
import { NdviKey } from "../../../shared/charts/NdviKey";
import { Button, Glass, SegmentedTabs, Skeleton } from "../../../shared/components";
import { useMedia } from "../../../shared/hooks/useMedia";
import { FarmMap, type MapField, type MapInsets } from "../../../shared/map/FarmMap";
import { AdvisorDrawer } from "../components/AdvisorDrawer";
import { DateControl, ReplayPill } from "../components/DateControl";
import { FieldsPanel, statusTone } from "../components/FieldsPanel";
import { StatusPanel } from "../components/StatusPanel";
import { fmtDate, fmtValue } from "../lib/format";
import { useHealth } from "../state/useHealth";
import type { FarmHealth } from "../types";

const FARM_ID = "demo";
const DESKTOP = "(min-width: 1024px)";
const DESKTOP_INSETS: MapInsets = { left: 370, right: 430, top: 94, bottom: 20 };
const STACKED_INSETS: MapInsets = { left: 0, right: 0, top: 0, bottom: 0 };

type Layer = "satellite" | "greenness";
type Tab = "fields" | "status";

function sourceText(health: FarmHealth | null, fieldId: string | null, loading: boolean): string {
  const parts: string[] = [];
  if (loading) parts.push("Updating…");
  const fields = health?.fields ?? [];
  const g = (fields.find((f) => f.id === fieldId)?.greenness ?? fields.find((f) => f.greenness)?.greenness)?.value;
  if (g?.period_start && g.period_end) parts.push(`MODIS · ${fmtDate(g.period_start)} to ${fmtDate(g.period_end)}`);
  parts.push("Imagery © Esri");
  return parts.join(" · ");
}

/** Command Center: each field's greenness against its own normal, and one cautious finding. */
export function CommandCenterPage({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const { health, loading, error, setAsOf, fieldId, selectField, retry } = useHealth(FARM_ID);
  const desktop = useMedia(DESKTOP);
  const [layer, setLayer] = useState<Layer>("greenness");
  const [picked, setTab] = useState<Tab | null>(null);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const closeAdvisor = useCallback(() => setAdvisorOpen(false), []);
  const drawer = advisorOpen && <AdvisorDrawer onClose={closeAdvisor} />;

  const n = health?.findings.length ?? 0;
  // Opens on Status when there is a finding, otherwise Fields, until the user picks a tab.
  const tab: Tab = picked ?? (n > 0 ? "status" : "fields");
  const topBar = (
    <TopBar route={route} onNavigate={onNavigate} farmName={health?.farm.name ?? "Demo Farm"} region={health?.farm.region ?? undefined}
      actions={
        <>
          {n > 0 && (
            <span className="flex items-center gap-[7px] whitespace-nowrap rounded-full border border-watch-fill/45 bg-watch-fill/12 px-3 py-[7px] text-[13px] font-bold text-watch">
              <i aria-hidden className="h-2 w-2 rounded-full bg-watch-fill" />
              <span>{n === 1 ? "1 finding" : `${n} findings`}</span>
            </span>
          )}
          {health && desktop && <DateControl health={health} onPick={setAsOf} />}
          <Button variant="primary" onClick={() => setAdvisorOpen(true)} aria-label="Ask the advisor">
            <MessageSquareText size={16} strokeWidth={1.75} />
            <span className="hidden whitespace-nowrap lg:inline">Ask the advisor</span>
          </Button>
        </>
      } />
  );

  const pageTitle = <h1 className="sr-only">Command Center</h1>;

  if (error && !health) {
    return (
      <Centered topBar={topBar} drawer={drawer}>
        <h2 className="flex items-center gap-2 text-[19px] font-bold"><AlertTriangle size={20} strokeWidth={1.75} className="text-alert" /> Couldn&apos;t load the farm&apos;s health</h2>
        <p className="mt-2 text-sm leading-normal text-mut">{error}</p>
        <Button className="mt-4" onClick={retry}><RefreshCw size={15} strokeWidth={1.75} /> Try again</Button>
      </Centered>
    );
  }

  if (health && health.fields.length === 0) {
    return (
      <Centered topBar={topBar} drawer={drawer}>
        <h2 className="text-[21px] font-bold tracking-[-.01em]">Draw your first field</h2>
        <p className="mt-2 text-sm leading-normal text-mut">
          {health.farm.name} has no fields yet. Add one in the farm profile, then come back to see its greenness against its normal.
        </p>
        <Button variant="primary" className="mt-5" onClick={() => onNavigate("farm-profile")}>Open farm profile</Button>
      </Centered>
    );
  }

  const mapFields: MapField[] = (health?.fields ?? []).map((f) => {
    const v = f.greenness?.value;
    return {
      id: f.id, name: f.name, boundary: f.boundary,
      chip: desktop && v?.value != null ? fmtValue(v) : undefined, // chips overlap on a small map
      ndviStep: layer === "greenness" && v?.value != null ? ndviStep(v.value) : null,
      tone: statusTone(f.status),
    };
  });
  const center = health?.farm.center ?? health?.fields[0]?.boundary[0] ?? null;
  const map = center && (
    <FarmMap fields={mapFields} selectedId={fieldId ?? undefined} onSelect={selectField} center={center}
      insets={desktop ? DESKTOP_INSETS : STACKED_INSETS} />
  );

  const layerSwitch = (
    <div className="glass !rounded-[13px]">
      <SegmentedTabs label="Map layer" size="sm" value={layer} onChange={setLayer}
        items={[{ id: "satellite", label: "Satellite" }, { id: "greenness", label: "Greenness" }]} />
    </div>
  );
  const sourcePill = <div className="glass !rounded-[10px] px-[11px] py-[6px] text-[12px]">{sourceText(health, fieldId, loading)}</div>;
  const refreshError = error && health && (
    <div role="alert" className="glass flex items-center gap-3 !rounded-[13px] px-3 py-2 text-[13px]">
      <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0 text-alert" />
      <span>{error} Showing {fmtDate(health.as_of)}.</span>
      <Button onClick={retry} className="!px-2.5 !py-1 text-[13px]">Try again</Button>
    </div>
  );

  const field = health?.fields.find((f) => f.id === fieldId) ?? null;
  const fieldsPanel = health ? <FieldsPanel health={health} fieldId={fieldId} onSelect={selectField} /> : <PanelSkeleton />;
  const statusPanel = health ? <StatusPanel health={health} field={field} onSelect={selectField} /> : <PanelSkeleton />;

  if (desktop) {
    return (
      <div className="relative h-full overflow-hidden">
        <main aria-label="Farm map" className="absolute inset-0">
          {pageTitle}
          {map}
          <div className="absolute left-[390px] top-[94px] z-10">{layerSwitch}</div>
          <div className="absolute left-[580px] right-[504px] top-[94px] z-10 flex flex-col items-center gap-2">
            {health?.is_replay && <ReplayPill asOf={health.as_of} />}
            {refreshError}
          </div>
          {layer === "greenness" && health?.greenness_available && <NdviKey className="absolute bottom-5 left-[390px] z-10" />}
          <div className="absolute bottom-5 right-[450px] z-10">{sourcePill}</div>
        </main>
        <div className="absolute inset-x-0 top-0 z-20">{topBar}</div>
        <Glass as="aside" aria-label="Fields" className="anim-in absolute bottom-5 left-5 top-[94px] z-10 w-[350px] overflow-hidden">
          {fieldsPanel}
        </Glass>
        <Glass as="aside" aria-label="Field status" className="anim-in absolute bottom-5 right-5 top-[94px] z-10 w-[410px] overflow-hidden">
          {statusPanel}
        </Glass>
        {drawer}
      </div>
    );
  }

  // Below 1024 px: the map, then one glass section with Fields / Status tabs (the Simulator's phone layout).
  return (
    <div className="flex min-h-full flex-col">
      {topBar}
      <main aria-label="Farm map" className="relative mx-4 mt-3 block h-[42vh] min-h-[260px] overflow-hidden rounded-panel border border-line">
        {pageTitle}
        {map}
        <div className="absolute left-2 top-2 z-[500]">{layerSwitch}</div>
        {health?.is_replay && <div className="absolute bottom-2 left-2 z-[500]"><ReplayPill asOf={health.as_of} /></div>}
      </main>
      {refreshError && <div className="mx-4 mt-3">{refreshError}</div>}
      <Glass as="section" aria-label="Command Center" className="mx-4 mb-4 mt-3 flex min-h-[70vh] flex-col overflow-hidden">
        {health && <div className="flex flex-wrap border-b border-line p-2.5"><DateControl health={health} onPick={setAsOf} /></div>}
        <div className="border-b border-line p-2.5">
          <SegmentedTabs label="Command Center views" value={tab} onChange={setTab}
            items={[{ id: "fields", label: "Fields" }, { id: "status", label: "Status" }]} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{tab === "status" ? statusPanel : fieldsPanel}</div>
      </Glass>
      <footer className="mx-4 mb-4 text-[12px] text-mut">{sourceText(health, fieldId, loading)}</footer>
      {drawer}
    </div>
  );
}

function Centered({ topBar, drawer, children }: { topBar: ReactNode; drawer: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {topBar}
      {drawer}
      <main className="grid flex-1 place-items-center p-6">
        <h1 className="sr-only">Command Center</h1>
        <Glass className="max-w-md p-6">{children}</Glass>
      </main>
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
