import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TopBar } from "../../../app/TopBar";
import type { Route } from "../../../app/route";
import { ndviStep } from "../../../shared/charts/ndvi";
import { NdviKey } from "../../../shared/charts/NdviKey";
import { Button, Glass, SegmentedTabs, Skeleton, StatusPill, Tour, tourSeen, type TourStep } from "../../../shared/components";
import { useMedia } from "../../../shared/hooks/useMedia";
import { FarmMap, type MapField, type MapInsets } from "../../../shared/map/FarmMap";
import { type ImageryCapture, imageryCredit, ImageryDateWatcher } from "../../../shared/map/ImageryDate";
import { useUnits } from "../../../shared/units";
import { DateControl, ReplayPill } from "../components/DateControl";
import { FieldsPanel, statusTone } from "../components/FieldsPanel";
import { StatusPanel } from "../components/StatusPanel";
import { fmtDate, fmtValue } from "../lib/format";
import { useAssistantBridge } from "../state/useAssistantBridge";
import { useHealth } from "../state/useHealth";
import type { FarmHealth } from "../types";
import { t as tr, tn as trn } from "../../../shared/i18n";

const DESKTOP = "(min-width: 1024px)";
const DESKTOP_INSETS: MapInsets = { left: 370, right: 430, top: 94, bottom: 20 };
const STACKED_INSETS: MapInsets = { left: 0, right: 0, top: 0, bottom: 0 };

const TOUR_ID = "command-center-v1";
const TOUR: TourStep[] = [
  { target: "cc-fields", title: tr("Your fields"), body: tr("Each field's greenness (NDVI) from NASA's MODIS satellites, against that field's own 10-year normal. Pick one to see its rain, heat and water demand.") },
  { target: "cc-layers", title: tr("What the map shows"), body: tr("Greenness colours each field on the NDVI scale; Satellite shows the plain imagery.") },
  { target: "cc-date", title: tr("Pick a date"), body: tr("Today, or replay a past season such as the 2012 drought, to see what the checks would have said then.") },
  { target: "cc-status", title: tr("Findings and the season"), body: tr("When a field drifts below its normal, you get a cautious finding and a check to do in the field, then this season against past ones.") },
  { target: "advisor", title: tr("Ask about it"), body: tr("Ask the advisor in your own words (or press Ctrl+K): it explains what this page shows, citing its numbers, and can change the date or the field for you. It never adds data of its own.") },
];

type Layer = "satellite" | "greenness";
type Tab = "fields" | "status";

function sourceText(health: FarmHealth | null, fieldId: string | null, loading: boolean, imagery: ImageryCapture | "error" | null): string {
  const parts: string[] = [];
  if (loading) parts.push(tr("Updating…"));
  const fields = health?.fields ?? [];
  const g = (fields.find((f) => f.id === fieldId)?.greenness ?? fields.find((f) => f.greenness)?.greenness)?.value;
  if (g?.period_start && g.period_end) parts.push(tr("MODIS · {fmtDate} to {fmtDate2}", { fmtDate: fmtDate(g.period_start), fmtDate2: fmtDate(g.period_end) }));
  parts.push(imageryCredit(imagery));
  return parts.join(" · ");
}

/** Command Center: each field's greenness against its own normal, and one cautious finding. */
export function CommandCenterPage({ farmId, route, onNavigate }: { farmId: string; route: Route; onNavigate: (r: Route) => void }) {
  const { health, loading, error, asOf, setAsOf, fieldId, selectField, retry } = useHealth(farmId);
  const desktop = useMedia(DESKTOP);
  const u = useUnits();
  const [layer, setLayer] = useState<Layer>("greenness");
  const [picked, setTab] = useState<Tab | null>(null);
  const [imagery, setImagery] = useState<ImageryCapture | "error" | null>(null);
  const [touring, setTouring] = useState(false);
  const endTour = useCallback(() => setTouring(false), []);
  useAssistantBridge({ health, asOf, setAsOf, fieldId, selectField, layer, setLayer });

  // First visit on a large screen: the tour starts once the panels are on screen (as on every dashboard).
  useEffect(() => {
    if (health && desktop && !tourSeen(TOUR_ID)) {
      const t = setTimeout(() => setTouring(true), 600);
      return () => clearTimeout(t);
    }
  }, [health, desktop]);

  const n = health?.findings.length ?? 0;
  // Opens on Status when there is a finding, otherwise Fields, until the user picks a tab.
  const tab: Tab = picked ?? (n > 0 ? "status" : "fields");
  const topBar = (
    <TopBar route={route} onNavigate={onNavigate}
      status={n > 0 && <StatusPill tone="watch">{trn(n, "1 finding", "{n} findings")}</StatusPill>}
      onHelp={() => { if (!desktop) setTab("fields"); setTouring(true); }} />
  );

  const pageTitle = <h1 className="sr-only">{tr("Command Center")}</h1>;

  if (error && !health) {
    return (
      <Centered topBar={topBar}>
        <h2 className="flex items-center gap-2 text-[19px] font-bold"><AlertTriangle size={20} strokeWidth={1.75} className="text-alert" /> {tr("Couldn't load the farm's health")}</h2>
        <p className="mt-2 text-sm leading-normal text-mut">{error}</p>
        <Button className="mt-4" onClick={retry}><RefreshCw size={15} strokeWidth={1.75} /> {tr("Try again")}</Button>
      </Centered>
    );
  }

  if (health && health.fields.length === 0) {
    return (
      <Centered topBar={topBar}>
        <h2 className="text-[21px] font-bold tracking-[-.01em]">{tr("Draw your first field")}</h2>
        <p className="mt-2 text-sm leading-normal text-mut">
          {tr("{name} has no fields yet. Add one in the farm profile, then come back to see its greenness against its normal.", { name: health.farm.name })}
        </p>
        <Button variant="primary" className="mt-5" onClick={() => onNavigate("farm-profile")}>{tr("Open farm profile")}</Button>
      </Centered>
    );
  }

  const mapFields: MapField[] = (health?.fields ?? []).map((f) => {
    const v = f.greenness?.value;
    return {
      id: f.id, name: f.name, boundary: f.boundary,
      chip: v?.value != null ? fmtValue(v, u) : undefined,
      ndviStep: layer === "greenness" && v?.value != null ? ndviStep(v.value) : null,
      tone: statusTone(f.status),
    };
  });
  const center = health?.farm.center ?? health?.fields[0]?.boundary[0] ?? null;
  const map = center && (
    <FarmMap fields={mapFields} selectedId={fieldId ?? undefined} onSelect={selectField} center={center}
      insets={desktop ? DESKTOP_INSETS : STACKED_INSETS} startOnGlobe={farmId === "demo"} globeLabel={health?.farm.name ?? tr("Demo Farm")}>
      <ImageryDateWatcher onChange={setImagery} />
    </FarmMap>
  );

  const layerSwitch = (
    <div className="glass !rounded-[13px]" data-tour="cc-layers" data-assist="cc.layer">
      <SegmentedTabs label={tr("Map layer")} size="sm" value={layer} onChange={setLayer}
        items={[{ id: "satellite", label: tr("Satellite") }, { id: "greenness", label: tr("Greenness") }]} />
    </div>
  );
  const source = sourceText(health, fieldId, loading, imagery);
  const sourcePill = <div className="glass max-w-full !rounded-[10px] px-[11px] py-[6px] text-[12px] leading-snug">{source}</div>;
  const refreshError = error && health && (
    <div role="alert" className="glass flex items-center gap-3 !rounded-[13px] px-3 py-2 text-[13px]">
      <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0 text-alert" />
      <span>{tr("{error} Showing {fmtDate}.", { error, fmtDate: fmtDate(health.as_of) })}</span>
      <Button onClick={retry} className="!px-2.5 !py-1 text-[13px]">{tr("Try again")}</Button>
    </div>
  );

  const field = health?.fields.find((f) => f.id === fieldId) ?? null;
  const fieldsPanel = health ? <FieldsPanel health={health} fieldId={fieldId} onSelect={selectField} /> : <PanelSkeleton />;
  const statusPanel = health ? <StatusPanel health={health} field={field} onSelect={selectField} /> : <PanelSkeleton />;

  if (desktop) {
    return (
      <div className="relative h-full overflow-hidden">
        <main aria-label={tr("Farm map")} className="absolute inset-0">
          {pageTitle}
          {map}
          <div className="absolute left-[390px] top-[94px] z-10">{layerSwitch}</div>
          <div className="absolute left-[580px] right-[504px] top-[94px] z-10 flex flex-col items-center gap-2">
            {health?.is_replay && <ReplayPill asOf={health.as_of} />}
            {refreshError}
          </div>
          {layer === "greenness" && health?.greenness_available && <NdviKey className="absolute bottom-5 left-[390px] z-10" />}
          <div className="absolute bottom-5 left-[390px] right-[450px] z-10 flex justify-end">{sourcePill}</div>
        </main>
        <div className="absolute inset-x-0 top-0 z-20">{topBar}</div>
        <Glass as="aside" aria-label={tr("Fields")} data-tour="cc-fields" className="anim-in absolute bottom-5 left-5 top-[94px] z-10 flex w-[350px] flex-col overflow-hidden">
          {health && (
            <div data-tour="cc-date" data-assist="cc.date" className="border-b border-line px-3 py-2.5">
              <DateControl health={health} onPick={setAsOf} />
            </div>
          )}
          {fieldsPanel}
        </Glass>
        <Glass as="aside" aria-label={tr("Field status")} data-tour="cc-status" className="anim-in absolute bottom-5 right-5 top-[94px] z-10 w-[410px] overflow-hidden">
          {statusPanel}
        </Glass>
        {touring && <Tour id={TOUR_ID} steps={TOUR} onClose={endTour} />}
      </div>
    );
  }

  // Below 1024 px: the map, then one glass section with Fields / Status tabs (the Simulator's phone layout).
  return (
    <div className="flex min-h-full flex-col">
      {topBar}
      <main aria-label={tr("Farm map")} className="relative isolate mx-4 mt-3 block h-[42vh] min-h-[260px] overflow-hidden rounded-panel border border-line">
        {pageTitle}
        {map}
        <div className="absolute left-2 top-2 z-[500]">{layerSwitch}</div>
        {health?.is_replay && <div className="absolute bottom-2 left-2 z-[500]"><ReplayPill asOf={health.as_of} /></div>}
      </main>
      {refreshError && <div className="mx-4 mt-3">{refreshError}</div>}
      <Glass as="section" aria-label={tr("Command Center")} className="mx-4 mb-4 mt-3 flex min-h-[70vh] flex-col overflow-hidden">
        {health && <div className="flex flex-wrap border-b border-line p-2.5"><DateControl health={health} onPick={setAsOf} /></div>}
        <div className="border-b border-line p-2.5">
          <SegmentedTabs label={tr("Command Center views")} value={tab} onChange={setTab} className="[&>button]:min-h-11"
            items={[{ id: "fields", label: tr("Fields") }, { id: "status", label: tr("Status") }]} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col" data-tour={tab === "status" ? "cc-status" : "cc-fields"}>{tab === "status" ? statusPanel : fieldsPanel}</div>
      </Glass>
      <footer className="mx-4 mb-4 text-[12px] text-mut">{source}</footer>
      {touring && <Tour id={TOUR_ID} steps={TOUR} onClose={endTour} />}
    </div>
  );
}

function Centered({ topBar, children }: { topBar: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {topBar}
      <main className="grid flex-1 place-items-center p-6">
        <h1 className="sr-only">{tr("Command Center")}</h1>
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
