/**
 * CropTwin page for the route "farm-profile" (wired in src/app/App.tsx). Layout follows DESIGN.md section 5: top bar
 * plus two glass panels over the map on desktop, map plus a tabbed sheet on phones.
 * It connects everything: the farm list (state/useFarms.ts), the open farm (state/useFarmProfile.ts), and the shared map
 * pieces in src/shared/map (FarmMap, BoundaryDraw, NasaLayerControl, MapSearch, LocateControl, MapFocus,
 * ImageryDateWatcher), plus the leave-without-saving guard, the start-at-your-location card and the source line.
 * FarmProfile is keyed by farm id, so switching farms starts from a clean state.
 */
import { AlertTriangle, LocateFixed, MapPin, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import { TopBar } from "../../../app/TopBar";
import type { Route } from "../../../app/route";
import { Button, Glass, SegmentedTabs, Skeleton, StatusPill, Tour, tourSeen, type TourStep } from "../../../shared/components";
import { useMedia } from "../../../shared/hooks/useMedia";
import { useUnits } from "../../../shared/units";
import { BoundaryDraw, type LatLng } from "../../../shared/map/BoundaryDraw";
import { FarmMap, type MapField, type MapInsets } from "../../../shared/map/FarmMap";
import { type LocationProblem, locationProblemText, requestLocation, type UserLocation } from "../../../shared/map/geolocation";
import { formatDayWithAge } from "../../../shared/map/dates";
import { type ImageryCapture, imageryCredit, ImageryDateWatcher } from "../../../shared/map/ImageryDate";
import { LocateControl } from "../../../shared/map/LocateControl";
import { type FocusTarget, MapClick, MapFocus, PointMarker } from "../../../shared/map/MapFocus";
import { MapSearch, type PlaceResults, type SearchResult } from "../../../shared/map/MapSearch";
import { REFERENCE_ATTRIBUTION } from "../../../shared/map/ReferenceLayers";
import { croptwinApi } from "../api/croptwinApi";
import { NASA_OVERLAY_NONE, NasaLayerControl, type NasaOverlay, type ValueReading } from "../../../shared/map/NasaLayerControl";
import type { PixelColour } from "../../../shared/map/pixelSample";
import { NASA_LAYERS } from "../../../shared/map/nasaLayers";
import { ConfirmProvider, useConfirm } from "../components/ConfirmDialog";
import { FarmPanel } from "../components/FarmPanel";
import { FarmPicker } from "../components/FarmPicker";
import { FieldPanel } from "../components/FieldPanel";
import { emptyNewFarm, type NewFarmDraft, NewFarmPanel } from "../components/NewFarmPanel";
import { boundaryIsNew, cropName, overlappingFields } from "../lib/draft";
import { useAssistantBridge } from "../state/useAssistantBridge";
import { useFarmProfile } from "../state/useFarmProfile";
import { type Farms, useFarms } from "../state/useFarms";
import { t as tr, tn as trn } from "../../../shared/i18n";

// ASSUMPTION: where the map opens when there's nothing to show (no fields, no farm point, no user location):
// the demo SoilGrids sample point in Story County, Iowa. See docs/modules/croptwin.md.
const FALLBACK_CENTER: LatLng = [42.03, -93.46];
const FALLBACK_NAME = "Story County, Iowa";
const DESKTOP = "(min-width: 1024px)";
const DESKTOP_INSETS: MapInsets = { left: 370, right: 430, top: 94, bottom: 20 };
const STACKED_INSETS: MapInsets = { left: 0, right: 0, top: 0, bottom: 0 };

const TOUR_ID = "farm-profile-v1";
const TOUR: TourStep[] = [
  { target: "fp-farm", title: tr("Your farm"), body: tr("Switch farms, add a new one, and set its name, region and the priorities the Simulator ranks rotations by.") },
  { target: "fp-fields", title: tr("Your fields"), body: tr("Draw each field on the satellite map, corner by corner, or type the coordinates. Its area is worked out from the outline.") },
  { target: "fp-field", title: tr("Field details"), body: tr("Crop, irrigation and soil for the selected field. Fill soil layers from ISRIC SoilGrids, add crop history, and see recent NASA weather.") },
  { target: "advisor", title: tr("Ask about it"), body: tr("The advisor explains what is saved for this farm and points out what is missing. It never adds data of its own.") },
];

// The map's zoom buttons sit `insets.right + 16` px from the right and are 38 px wide; the drawing
// toolbar stops 12 px short of them.
const toolbarStyle = (left: number, top: number, insets: MapInsets, zoomW = 38) =>
  ({ left, top, maxWidth: `calc(100% - ${left + insets.right + 16 + zoomW + 12}px)` });
/** On phones the zoom buttons are 44 px wide (tap targets), on desktop 38 px. */
const PHONE_ZOOM_W = 44;

type PageProps = { route: Route; onNavigate: (r: Route) => void };

/** Farm profile (CropTwin): the Command Center shell, top bar plus floating panels over the map. */
export function FarmProfilePage(props: PageProps) {
  return <ConfirmProvider><FarmsShell {...props} /></ConfirmProvider>;
}

/** Loads the farm list, then opens the chosen farm (a fresh page state per farm). */
function FarmsShell(props: PageProps) {
  const farms = useFarms();
  if (!farms.farms || (farms.error && !farms.farms.length)) {
    return farms.error ? <PageError {...props} message={farms.error} /> : <PageLoading {...props} />;
  }
  return <FarmProfile key={farms.selectedId ?? "none"} {...props} farmId={farms.selectedId} farms={farms} />;
}

/** NASA's class for a pixel colour, via our backend (it reads the GIBS colour map). Stable for effects. */
const readNasaValue = (colormap: string, colour: PixelColour, signal: AbortSignal): Promise<ValueReading> =>
  croptwinApi.nasaColour(colormap, colour, signal);

/** ", with its 2 fields and 6 soil layers": only the counts that aren't zero, so the dialog never lists "0 …". */
function withItems(items: [number, string, string][]): string {
  // one/many are translation keys with {n}, e.g. "{n} field" / "{n} fields".
  const parts = items.filter(([n]) => n > 0).map(([n, one, many]) => trn(n, one, many));
  if (!parts.length) return "";
  return tr(" with its {v}", { v: parts.length > 1 ? `${parts.slice(0, -1).join(", ")}${tr(" and ")}${parts[parts.length - 1]}` : parts[0] });
}

let focusKey = 0;
const focusOn = (point: LatLng, zoom?: number): FocusTarget => ({ key: ++focusKey, point, zoom });
const focusBounds = (bounds: [LatLng, LatLng]): FocusTarget => ({ key: ++focusKey, bounds });

/** Place names through our backend (Nominatim, within its usage policy), as map search results. */
async function searchPlaces(q: string, signal: AbortSignal): Promise<PlaceResults> {
  const found = await croptwinApi.searchPlaces(q, signal);
  return {
    attribution: found.attribution,
    results: found.results.map((r, i) => {
      const [first, ...rest] = r.name.split(", ");
      return {
        id: `place-${i}-${r.lat}-${r.lon}`, kind: "place" as const, title: first, subtitle: rest.join(", ") || r.kind || undefined,
        point: [r.lat, r.lon] as LatLng,
        bounds: r.bbox ? [[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]] as [LatLng, LatLng] : undefined,
      };
    }),
  };
}

function FarmProfile({ route, onNavigate, farmId, farms }: PageProps & { farmId: string | null; farms: Farms }) {
  const p = useFarmProfile(farmId);
  useAssistantBridge(p, (id) => void farms.refresh(id));
  const { farm, drafts, drawing, actions } = p;
  const desktop = useMedia(DESKTOP);
  const u = useUnits();
  const confirm = useConfirm();
  const [touring, setTouring] = useState(false);
  const endTour = useCallback(() => setTouring(false), []);
  const [sheet, setSheet] = useState<"farm" | "field">("farm");
  const [nasa, setNasa] = useState<NasaOverlay>(NASA_OVERLAY_NONE);
  const [borders, setBorders] = useState(true);
  const [imagery, setImagery] = useState<ImageryCapture | "error" | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [newFarm, setNewFarm] = useState<NewFarmDraft | null>(() => (farms.farms?.length ? null : emptyNewFarm()));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // The user's own location: kept in this component only, never sent anywhere or stored.
  const [me, setMe] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationProblem, setLocationProblem] = useState<LocationProblem | null>(null);
  const [startAsked, setStartAsked] = useState(false); // the "start at your location?" card was answered
  const unsaved = p.dirty || !!drawing;

  // The farm list (top bar switcher, other dashboards) follows saved renames and field counts.
  const listed = farms.farms?.find((f) => f.id === farm?.id);
  useEffect(() => {
    if (farm && listed && (listed.name !== farm.name || listed.region !== farm.region || listed.field_count !== farm.fields.length)) {
      void farms.refresh(farm.id);
    }
  }, [farm, listed, farms]);

  // First visit on a large screen: the tour starts once the panels are on screen (as on every dashboard).
  useEffect(() => {
    if (farm && desktop && !tourSeen(TOUR_ID)) {
      const t = setTimeout(() => setTouring(true), 600);
      return () => clearTimeout(t);
    }
  }, [farm, desktop]);

  // Reloads and tab closes: the browser's own prompt (pages can't style it).
  useEffect(() => {
    if (!unsaved) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [unsaved]);

  /** Ask before throwing away unsaved work (leaving the page, switching or deleting farms). */
  const okToLeave = useCallback(async (what: string) => !unsaved || confirm({
    title: tr("Leave without saving?"),
    confirmLabel: what,
    cancelLabel: tr("Stay and save"),
    danger: true,
    body: <p>{tr("Your changes to this farm aren't saved yet")}{drawing ? tr(", and a boundary is still being drawn") : ""}{tr(". If you continue they're lost.")}</p>,
  }), [unsaved, drawing, confirm]);

  const navigate = useCallback(async (r: Route) => {
    if (r !== route && !(await okToLeave(tr("Leave without saving")))) return;
    onNavigate(r);
  }, [route, okToLeave, onNavigate]);

  const switchFarm = async (id: string) => {
    if (id !== farmId && (await okToLeave(tr("Switch without saving")))) farms.select(id);
  };

  const deleteFarm = async () => {
    if (!farm) return;
    const layers = farm.fields.reduce((n, f) => n + f.soil_layers.length, 0);
    const history = farm.fields.reduce((n, f) => n + f.crop_history.length, 0);
    const ok = await confirm({
      title: tr("Delete {name}?", { name: farm.name }),
      danger: true,
      confirmLabel: tr("Delete farm"),
      cancelLabel: tr("Keep it"),
      body: (
        <>
          <p>
            {tr("{name} is removed{withItems}. This can't be undone.", { name: farm.name, withItems: withItems([
              [farm.fields.length, "{n} field", "{n} fields"], [layers, "{n} soil layer", "{n} soil layers"],
              [history, "{n} crop history entry", "{n} crop history entries"],
            ]) })}
          </p>
          <p>{tr("The Simulator's saved runs for this farm are deleted too.")}</p>
        </>
      ),
    });
    if (!ok) return;
    try {
      await farms.remove(farm.id);
    } catch (e) {
      setCreateError(tr("Couldn't delete {name}: {message} Reload the page to see your farms.", { name: farm.name, message: (e as Error).message }));
    }
  };

  const locate = useCallback(async (andThen?: (l: UserLocation) => void) => {
    setLocating(true);
    setLocationProblem(null);
    try {
      const l = await requestLocation();
      setMe(l);
      setFocus(focusOn(l.point, 14));
      andThen?.(l);
    } catch (problem) {
      setLocationProblem(problem as LocationProblem);
    } finally {
      setLocating(false);
      setStartAsked(true);
    }
  }, []);

  const startNewFarm = async () => {
    if (await okToLeave(tr("Continue without saving"))) {
      setCreateError(null);
      setNewFarm(emptyNewFarm());
    }
  };

  const createFarm = async () => {
    if (!newFarm) return;
    setCreating(true);
    setCreateError(null);
    try {
      await farms.create({
        name: newFarm.name.trim(), region: newFarm.region.trim() || null,
        location_lat: newFarm.point?.[0] ?? null, location_lon: newFarm.point?.[1] ?? null,
      });
    } catch (e) {
      setCreateError(tr("Couldn't create the farm: {message} Check the name and point, then try again.", { message: (e as Error).message }));
      setCreating(false);
    }
  };

  const topBar = (
    <TopBar route={route} onNavigate={(r) => void navigate(r)} onSwitchFarm={(id) => void switchFarm(id)}
      farmOverride={newFarm ? { name: tr("New farm") } : farm ? { name: farm.name, region: farm.region } : undefined}
      status={unsaved && <StatusPill tone="watch">{tr("Unsaved changes")}</StatusPill>}
      onHelp={() => { if (!desktop) setSheet("farm"); setTouring(true); }} />
  );

  if (p.loadError) return <PageError route={route} onNavigate={onNavigate} message={p.loadError} />;

  // ----- the map -----
  const farmPoint: LatLng | null = farm && farm.location_lat !== null && farm.location_lon !== null
    ? [farm.location_lat, farm.location_lon] : null;
  const hasFields = !!farm?.fields.length;
  // Nothing to centre on (no fields, no farm point, or a new farm without a point yet): offer the user's location,
  // once, with the reason shown.
  const nothingToShow = !p.loading && (newFarm ? !newFarm.point : !hasFields && !farmPoint);
  // The map really is on the fallback point only for a farm with nothing to show (not while creating a new one).
  const onFallback = nothingToShow && !newFarm;
  const center: LatLng = hasFields
    ? [farm!.fields.reduce((s, f) => s + f.centroid_lat, 0) / farm!.fields.length,
      farm!.fields.reduce((s, f) => s + f.centroid_lon, 0) / farm!.fields.length]
    : farmPoint ?? FALLBACK_CENTER;

  // Fields on the map: every finished outline except a new one still being drawn (BoundaryDraw shows that).
  // The outline being drawn, or the selected field's: if it's new or changed, it must not share area with another.
  const focusField = drafts.find((d) => d.id === (drawing?.fieldId ?? p.selectedId));
  const clashes = focusField && boundaryIsNew(focusField, p.savedField(focusField.id)) ? overlappingFields(focusField, drafts) : [];
  const mapFields: MapField[] = newFarm ? [] : drafts
    .filter((d) => d.closed && d.ring.length >= 3 && !(d.isNew && drawing?.fieldId === d.id))
    .map((d) => {
      const area = p.savedField(d.id)?.area_ha;
      return { id: d.id, name: d.name || tr("Unnamed field"), boundary: d.ring, alert: clashes.some((c) => c.id === d.id),
        chip: [d.current_crop_id && cropName(d.current_crop_id), area && u.area(area)].filter(Boolean).join(" · ") };
    });
  const drawn = drawing && drafts.find((d) => d.id === drawing.fieldId);

  const selectField = (id: string) => {
    actions.select(id);
    if (!desktop) setSheet("field");
  };

  const pickPoint = (point: LatLng, from: NewFarmDraft["pointFrom"]) =>
    setNewFarm((d) => d && { ...d, point, pointFrom: from, picking: false });

  // Search: this farm's fields and the other farms match locally; places come from the backend on Enter.
  const localResults: SearchResult[] = [
    ...(newFarm ? [] : drafts.filter((d) => d.closed && d.ring.length >= 3).map((d): SearchResult => {
      const lats = d.ring.map((pt) => pt[0]), lons = d.ring.map((pt) => pt[1]);
      return { id: d.id, kind: "field", title: d.name || tr("Unnamed field"), subtitle: tr("Field on {v}", { v: farm?.name ?? "this farm" }),
        point: d.ring[0], bounds: [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]] };
    })),
    ...(farms.farms ?? []).filter((f) => f.id !== farmId).map((f): SearchResult => ({
      id: f.id, kind: "farm", title: f.name, subtitle: `${tr("Farm")} · ${trn(f.field_count, "{n} field", "{n} fields")}`,
      point: center,
    })),
  ];
  const onSearchPick = (r: SearchResult) => {
    if (r.kind === "farm") return void switchFarm(r.id);
    if (r.kind === "field") {
      selectField(r.id);
      return setFocus(r.bounds ? focusBounds(r.bounds) : focusOn(r.point));
    }
    setFocus(r.bounds ? focusBounds(r.bounds) : focusOn(r.point, 13));
    if (newFarm) pickPoint(r.point, "search");
  };

  // Read NASA values at the selected (saved) field's centre.
  const probeField = !newFarm && p.selectedId ? p.savedField(p.selectedId) : undefined;

  const insets = desktop ? DESKTOP_INSETS : STACKED_INSETS;
  const globeOn = !farmId || farmId === "demo";
  const map = !p.loading && (
    <FarmMap fields={mapFields} selectedId={p.selectedId} onSelect={drawing || newFarm ? undefined : selectField} center={center}
      insets={insets} startOnGlobe={globeOn} globeLabel={farm?.name ?? "your farm"}>
      <MapFocus target={focus} />
      <ImageryDateWatcher onChange={setImagery} />
      {!drawing && focusField && focusField.ring.length >= 3 && (
        <ZoomToSelected key={focusField.id} ring={focusField.ring} insets={insets} />
      )}
      <MapClick active={!!newFarm?.picking} onPick={(pt) => pickPoint(pt, "the map")} />
      {newFarm?.point && <PointMarker point={newFarm.point} />}
      {!newFarm && !hasFields && farmPoint && <PointMarker point={farmPoint} />}
      {me && <PointMarker point={me.point} accuracyM={me.accuracyM} />}
      {drawn && (
        <BoundaryDraw points={drawn.ring} closed={drawn.closed} onChange={actions.setBoundary}
          overlapping={clashes.map((c) => c.name.trim() || "an unnamed field")}
          onDone={actions.finishBoundary} onCancel={actions.cancelBoundary}
          toolbarStyle={desktop ? toolbarStyle(DESKTOP_INSETS.left + 20, DESKTOP_INSETS.top, DESKTOP_INSETS)
            : toolbarStyle(8, 8, STACKED_INSETS, PHONE_ZOOM_W)} />
      )}
      {!drawing && (
        <MapSearch local={localResults} searchPlaces={searchPlaces} onPick={onSearchPick}
          style={desktop ? { left: DESKTOP_INSETS.left + 20, top: DESKTOP_INSETS.top }
            : { left: 8, top: 8, maxWidth: `calc(100% - ${8 + STACKED_INSETS.right + 16 + PHONE_ZOOM_W + 8}px)` }} />
      )}
      <LocateControl busy={locating} onLocate={() => void locate()}
        // Under the zoom buttons (2, or 3 with "Zoom out to the globe"): 38 px each on desktop, 44 px on phones, plus an 8 px gap.
        style={{ right: insets.right + 16, top: insets.top + (globeOn ? 3 : 2) * (desktop ? 38 : 44) + 8 }} />
      <NasaLayerControl value={nasa} onChange={setNasa} borders={borders} onBorders={setBorders} readValue={readNasaValue}
        probe={probeField ? { label: probeField.name, point: [probeField.centroid_lat, probeField.centroid_lon] } : null}
        // The panel opens upward and stops below the search box (44 px tall + a 12 px gap).
        style={desktop
          // Above the source line (up to 3 lines of 12 px text, about 64 px, plus an 8 px gap).
          ? { left: DESKTOP_INSETS.left + 20, bottom: DESKTOP_INSETS.bottom + 72, maxHeight: `calc(100% - ${DESKTOP_INSETS.top + 56 + DESKTOP_INSETS.bottom + 72}px)` }
          : { left: 8, bottom: 8, maxHeight: "calc(100% - 72px)", maxWidth: `calc(100% - ${8 + STACKED_INSETS.right + 16 + PHONE_ZOOM_W + 8}px)` }} />
    </FarmMap>
  );

  // "Start at your location?" (asked once, with the reason), then the fallback notice if it's off.
  const startCard = !drawing && (nothingToShow && !startAsked && !me ? (
    <Glass className="w-full max-w-[380px] p-4" role="region" aria-label={tr("Start the map at your location")}>
      <p className="flex items-center gap-2 text-[15px] font-bold"><LocateFixed size={17} strokeWidth={1.75} /> {tr("Start the map where you are?")}</p>
      <p className="mt-1 text-[13px] leading-snug text-mut">
        {newFarm ? tr("This farm has no point yet.") : tr("This farm has no fields or map point yet.")} {tr("Your location only centres the map in this browser. It isn't saved or sent anywhere unless you create a farm with it.")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="max-sm:min-h-11" onClick={() => void locate()} disabled={locating}>{tr("Use my location")}</Button>
        <Button variant="ghost" className="max-sm:min-h-11" onClick={() => setStartAsked(true)}>{tr("Not now")}</Button>
      </div>
    </Glass>
  ) : onFallback && !me && (startAsked || locationProblem) ? (
    <Glass className="w-full max-w-[380px] p-3" role="status">
      <p className="flex items-start gap-2 text-[13px] leading-snug">
        <MapPin size={15} strokeWidth={1.75} className="mt-px shrink-0 text-mut" />
        <span>
          <span className="font-semibold">{tr("Location off: showing {FALLBACK_NAME}.", { FALLBACK_NAME })}</span>{" "}
          <span className="text-mut">{locationProblem ? locationProblemText[locationProblem] : tr("Search for your area or allow location.")}</span>
        </span>
      </p>
    </Glass>
  ) : locationProblem ? (
    <Glass className="w-full max-w-[380px] p-3" role="alert">
      <p className="flex items-start gap-2 text-[13px] leading-snug text-alert">
        <AlertTriangle size={15} strokeWidth={1.75} className="mt-px shrink-0" /> {locationProblemText[locationProblem]}
      </p>
    </Glass>
  ) : null);

  // DESIGN.md section 8.3: the map says what it shows and from when.
  const overlay = NASA_LAYERS.find((l) => l.key === nasa.key);
  // When the imagery under the map centre was captured, from Esri's own metadata (ImageryDate.tsx).
  const imageryText = imageryCredit(imagery);
  const sourceText = tr("{imageryText} · Soil ISRIC SoilGrids v2.0 (saved sample){v}{v2}", { imageryText, v: overlay?.gibs && nasa.date ? ` · NASA GIBS ${overlay.product.shortName} ${formatDayWithAge(nasa.date)}` : "", v2: borders ? ` · ${REFERENCE_ATTRIBUTION}` : "" });
  const sourcePill = <div className="glass max-w-full !rounded-[10px] px-[11px] py-[6px] text-[12px] leading-snug">{sourceText}</div>;

  const picker = farms.farms && (
    <FarmPicker farms={farms.farms} selectedId={farmId} disabled={!!drawing}
      onSwitch={(id) => void switchFarm(id)} onNew={() => void startNewFarm()} onDelete={farm ? () => void deleteFarm() : undefined} />
  );
  const left = newFarm ? (
    <NewFarmPanel draft={newFarm} onChange={(patch) => setNewFarm((d) => d && { ...d, ...patch })}
      onLocate={() => void locate((l) => pickPoint(l.point, "your location"))} locating={locating}
      onCreate={() => void createFarm()} onCancel={() => setNewFarm(null)} creating={creating} error={createError}
      canCancel={!!farms.farms?.length} />
  ) : farm ? <FarmPanel p={p} picker={picker} /> : <PanelSkeleton />;
  const right = farm ? <FieldPanel p={p} /> : <PanelSkeleton />;
  const showRight = !newFarm && (!farm || p.selectedId);

  const pageTitle = <h1 className="sr-only">{tr("Farm profile")}</h1>;
  return (
    <div className={desktop ? "relative h-full overflow-hidden" : "flex min-h-full flex-col"}>
      {desktop ? (
        <>
          <main aria-label={tr("Farm map")} className="absolute inset-0">
            {pageTitle}
            {map}
            {startCard && <div className="absolute left-[390px] right-[450px] top-[45%] z-10 flex justify-center">{startCard}</div>}
            {/* The source line stays between the panels and wraps (DESIGN.md section 8.3: always visible, never on a panel). */}
            <div className="absolute bottom-5 left-[390px] right-[450px] z-10 flex justify-end">{sourcePill}</div>
          </main>
          <div className="absolute inset-x-0 top-0 z-20">{topBar}</div>
          <Glass as="aside" aria-label={tr("Farm and fields")} data-tour="fp-farm" className="anim-in absolute bottom-5 left-5 top-[94px] z-10 w-[350px] overflow-hidden">
            {left}
          </Glass>
          {showRight && (
            <Glass as="aside" aria-label={tr("Selected field")} data-tour="fp-field" className="anim-in absolute bottom-5 right-5 top-[94px] z-10 w-[410px] overflow-hidden">
              {right}
            </Glass>
          )}

        </>
      ) : (
        <>
          {topBar}
          <main aria-label={tr("Farm map")} className="relative isolate mx-4 mt-3 block h-[42vh] min-h-[260px] overflow-hidden rounded-panel border border-line">
            {pageTitle}
            {map || <Skeleton className="h-full w-full" />}
          </main>
          {startCard && <div className="mx-4 mt-3">{startCard}</div>}
          <Glass as="section" aria-label={tr("Farm profile")} className="mx-4 mb-4 mt-3 flex min-h-[70vh] flex-col overflow-hidden">
            {!newFarm && (
              <div className="border-b border-line p-2.5">
                <SegmentedTabs label={tr("Farm profile views")} value={sheet} onChange={setSheet} className="[&>button]:min-h-11"
                  items={[{ id: "farm", label: tr("Farm & fields") }, { id: "field", label: tr("Selected field") }]} />
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col" data-tour={newFarm || sheet === "farm" ? "fp-farm" : "fp-field"}>
              {newFarm || sheet === "farm" ? left : right}
            </div>
          </Glass>
          <footer className="mx-4 mb-4 text-[12px] text-mut">{sourceText}</footer>
        </>
      )}
      {touring && <Tour id={TOUR_ID} steps={TOUR} onClose={endTour} />}
    </div>
  );
}

/**
 * When a field is selected, bring it into view: zoom to it if it's off-screen or too small to see (zoom < 12), so
 * field-scale data (30 m images, values at its centre) is visible. Leaves the map alone if the field is already in view.
 */
function ZoomToSelected({ ring, insets }: { ring: LatLng[]; insets: MapInsets }) {
  const map = useMap();
  useEffect(() => {
    const lats = ring.map((p) => p[0]), lons = ring.map((p) => p[1]);
    const bounds: [LatLng, LatLng] = [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
    if (map.getZoom() >= 12 && map.getBounds().contains(bounds)) return;
    map.fitBounds(bounds, {
      maxZoom: 16, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      paddingTopLeft: [insets.left + 16, insets.top + 56], paddingBottomRight: [insets.right + 16, insets.bottom + 48],
    });
    // Once per selected field (the key changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function PageError({ route, onNavigate, message }: PageProps & { message: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar route={route} onNavigate={onNavigate} />
      <main className="grid flex-1 place-items-center p-6">
        <Glass className="max-w-md p-6">
          <h1 className="flex items-center gap-2 text-[19px] font-bold">
            <AlertTriangle size={20} strokeWidth={1.75} className="text-alert" /> {tr("Couldn't load the farm profile")}
          </h1>
          <p className="mt-2 text-sm leading-normal text-mut">{message}</p>
          <Button className="mt-4" onClick={() => location.reload()}><RefreshCw size={15} strokeWidth={1.75} /> {tr("Try again")}</Button>
        </Glass>
      </main>
    </div>
  );
}

function PageLoading({ route, onNavigate }: PageProps) {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar route={route} onNavigate={onNavigate} />
      <Glass as="aside" className="m-5 w-[350px] max-w-[calc(100%-40px)]"><PanelSkeleton /></Glass>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 p-[18px]" aria-busy="true" aria-label={tr("Loading the farm profile")}>
      <Skeleton className="h-5 w-24" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      <Skeleton className="mt-6 h-5 w-32" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}

