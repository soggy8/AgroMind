/**
 * Shared map control, added by CropTwin: the "NASA data" layer switcher. It covers:
 *  - one NASA GIBS overlay at a time, with dates read live from GIBS DescribeDomains (gibs.ts), never after today (UTC)
 *  - legend, kind, units and pixel size for each layer (nasaLayers.ts)
 *  - the value at the selected field: the pixel's colour, looked up in NASA's colour classes by the page's readValue
 *    (CropTwin backend /api/farms/nasa-colour)
 *  - "Nothing drawn here" when the farm's pixel is transparent, with a search back for the latest date with data
 *  - Worldview and Earthdata Search links, and the borders and place names toggle (ReferenceLayers.tsx)
 */
import L from "leaflet";
import { AlertTriangle, ExternalLink, Layers, Loader2, X } from "lucide-react";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import { KindTag } from "../components";
import { formatDayWithAge } from "./dates";
import {
  availableDates, type DateRange, earthdataSearchUrl, firstDate, formatDate, lastDate, nearestDate, periodText, previousDate,
  tileUrl, worldviewUrl,
} from "./gibs";
import type { LatLng } from "./BoundaryDraw";
import { NASA_LAYERS, type NasaLayer, scaleNote } from "./nasaLayers";
import { type PixelColour, samplePixel } from "./pixelSample";
import { ReferenceLayers } from "./ReferenceLayers";

export interface NasaOverlay {
  key: string | null;
  date: string | null;
  opacity: number;
}

export const NASA_OVERLAY_NONE: NasaOverlay = { key: null, date: null, opacity: 0.75 };

/** NASA's class for a pixel colour, from the layer's GIBS colour map (looked up by the caller's backend). */
export interface ValueReading {
  status: "class" | "nodata" | "transparent" | "unknown";
  low: number | null;
  high: number | null;
  units: string | null;
  title: string | null;
  label: string | null;
}

/** Where to read a value: a field's centroid, with a name for the label. */
export interface Probe { label: string; point: LatLng }

const fmt = (n: number) => String(Number(n.toPrecision(6)));
/** Today's date in UTC. NASA's lists sometimes run a day past it (seen: MODIS land surface temperature listed for
 * tomorrow, with nothing drawn yet), so dates are never picked, offered or allowed after today. */
const todayUTC = () => new Date().toISOString().slice(0, 10);
/** NASA's class bounds as words, e.g. "0.105–0.107", "below 0.1", "53.0884 or more". No interpolation. */
export function rangeText(r: ValueReading): string {
  if (r.low !== null && r.high !== null) {
    if (r.low === r.high) return fmt(r.low);
    // A dash between negative numbers reads as a minus sign: say "to" instead.
    return r.low < 0 || r.high < 0 ? `${fmt(r.low)} to ${fmt(r.high)}` : `${fmt(r.low)}–${fmt(r.high)}`;
  }
  if (r.high !== null) return `below ${fmt(r.high)}`;
  if (r.low !== null) return `${fmt(r.low)} or more`;
  return "";
}
/** Kelvin bounds also in °C (exact: K − 273.15), for farmers who think in Celsius. */
const celsius = (r: ValueReading) => {
  const c = (k: number) => fmt(Math.round((k - 273.15) * 100) / 100);
  if (r.low !== null && r.high !== null) return `${c(r.low)}–${c(r.high)} °C`;
  if (r.high !== null) return `below ${c(r.high)} °C`;
  return r.low !== null ? `${c(r.low)} °C or more` : "";
};

type Status = "idle" | "dates" | "loading" | "ok" | "empty" | "offline";

/**
 * NASA data on the map (DESIGN.md sections 5, 6, 8 and 9): a glass pill that opens a layer list. One overlay at a
 * time, drawn as NASA GIBS map tiles over the base imagery and under the field outlines, with its date, kind,
 * units, colour key, pixel size and links to Worldview and Earthdata Search. Render it inside a react-leaflet map.
 * `value` is controlled so the page can show the active layer in its source pill.
 */
export function NasaLayerControl({ value, onChange, style, borders, onBorders, probe, readValue }: {
  value: NasaOverlay;
  onChange: (v: NasaOverlay) => void;
  /** Country borders and place names (Esri World Boundaries and Places; see ReferenceLayers.tsx). */
  borders: boolean;
  onBorders: (on: boolean) => void;
  /** Read the active layer's value here (e.g. the selected field's centroid). */
  probe?: Probe | null;
  /** Turns a pixel colour into NASA's class for the named GIBS colour map. */
  readValue?: (colormap: string, colour: PixelColour, signal: AbortSignal) => Promise<ValueReading>;
  /** Where the pill sits over the map. The panel opens upward from it. */
  style?: CSSProperties;
}) {
  const map = useMap();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [ranges, setRanges] = useState<DateRange[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [picked, setPicked] = useState<string | null>(null); // what the user asked for, when it had no data
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());
  const tiles = useRef({ ok: 0, failed: 0 });
  // While the date was chosen for the user (the latest listed), a date with no tiles steps back automatically:
  // NASA's date list can include dates it has no tiles for (seen with GRACE, listed to Dec 2022, tiles to Jul 2022).
  const auto = useRef({ on: true, tries: 0 });
  // The newest date that actually loaded tiles when the panel picked it (NASA's list can run past its tiles).
  const [latestOk, setLatestOk] = useState<string | null>(null);
  const panelId = useId();
  const pill = useRef<HTMLButtonElement>(null);
  const layer = NASA_LAYERS.find((l) => l.key === value.key);
  // Is anything drawn where the user is looking (their field, else the map centre)? Many NASA layers are daily
  // satellite passes or cloud-limited images: the tiles load (HTTP 200) but are transparent over the farm, which
  // otherwise looks like "not loading".
  const [here, setHere] = useState<{ state: "unknown" | "checking" | "data" | "empty"; where?: string }>({ state: "unknown" });
  const [search, setSearch] = useState<{ state: "idle" | "searching" | "none"; checked: number }>({ state: "idle", checked: 0 });
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!box.current) return;
    L.DomEvent.disableClickPropagation(box.current);
    L.DomEvent.disableScrollPropagation(box.current);
  }, []);

  useEffect(() => {
    const update = () => { setBounds(map.getBounds()); setZoom(map.getZoom()); };
    map.on("moveend", update);
    return () => { map.off("moveend", update); };
  }, [map]);

  // Available dates for the chosen layer, live from GIBS; default to the latest.
  useEffect(() => {
    setRanges(null);
    if (!layer?.gibs) {
      setStatus("idle");
      return;
    }
    let live = true;
    auto.current = { on: true, tries: 0 };
    setLatestOk(null);
    setStatus("dates");
    availableDates(layer.gibs).then((r) => {
      if (!live) return;
      setRanges(r);
      if (!value.date || !nearestDate(r, value.date) || value.date > todayUTC()) onChange({ ...value, date: nearestDate(r, todayUTC()) });
    }).catch(() => live && setStatus("offline"));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer?.key]);

  const choose = (key: string | null) => {
    setPicked(null);
    searchAbort.current?.abort();
    setSearch({ state: "idle", checked: 0 });
    setHere({ state: "unknown" });
    onChange({ ...value, key, date: null });
  };

  /** Where to check for data: the selected field's centre, else the map centre. */
  const focus = (): { point: LatLng; where: string } => probe
    ? { point: probe.point, where: probe.label }
    : { point: [map.getCenter().lat, map.getCenter().lng], where: "the map centre" };

  const checkHere = async () => {
    if (!layer?.gibs || !value.date) return;
    const f = focus();
    setHere({ state: "checking", where: f.where });
    try {
      const c = await samplePixel(layer, value.date, f.point);
      setHere({ state: c.a === 0 ? "empty" : "data", where: f.where });
    } catch {
      setHere({ state: "empty", where: f.where });
    }
  };

  /** Step back through NASA's available dates until the pixel at the focus point has data (at most 20 dates). */
  const findLatestHere = async () => {
    if (!layer?.gibs || !ranges || !value.date) return;
    searchAbort.current?.abort();
    const ctrl = new AbortController();
    searchAbort.current = ctrl;
    const f = focus();
    let d: string | null = value.date;
    for (let checked = 1; checked <= 20 && d; checked++) {
      d = previousDate(ranges, d);
      if (!d) break;
      setSearch({ state: "searching", checked });
      try {
        const c = await samplePixel(layer, d, f.point, ctrl.signal);
        if (c.a > 0) {
          auto.current.on = false;
          setSearch({ state: "idle", checked: 0 });
          setPicked(null);
          return onChange({ ...value, date: d });
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    setSearch({ state: "none", checked: 20 });
  };

  const pickDate = (wanted: string) => {
    if (!ranges || !wanted) return;
    const d = nearestDate(ranges, wanted > todayUTC() ? todayUTC() : wanted);
    auto.current.on = false;
    setPicked(d === wanted ? null : wanted);
    if (d) onChange({ ...value, date: d });
  };

  const tileEvents = {
    loading: () => {
      tiles.current = { ok: 0, failed: 0 };
      setStatus("loading");
    },
    tileload: () => { tiles.current.ok += 1; },
    tileerror: () => { tiles.current.failed += 1; },
    load: () => {
      if (tiles.current.ok > 0 || tiles.current.failed === 0) {
        setStatus("ok");
        if (auto.current.on && auto.current.tries > 0 && value.date) setLatestOk(value.date);
        return void checkHere();
      }
      if (!navigator.onLine) return setStatus("offline");
      const back = ranges && value.date && auto.current.on && auto.current.tries < 12 ? previousDate(ranges, value.date) : null;
      if (back) {
        auto.current.tries += 1;
        onChange({ ...value, date: back });
      } else {
        setStatus("empty");
      }
    },
  };

  // The value under the probe: the exact pixel colour NASA drew there, looked up in NASA's colour map.
  const [reading, setReading] = useState<{ state: "idle" | "loading" | "done" | "error"; value?: ValueReading; error?: string }>({ state: "idle" });
  const probeKey = probe ? `${probe.point[0]},${probe.point[1]}` : "";
  useEffect(() => {
    const colormap = layer?.gibs?.colormap;
    if (!colormap || !value.date || !probe || !readValue) return setReading({ state: "idle" });
    const ctrl = new AbortController();
    setReading({ state: "loading" });
    samplePixel(layer!, value.date, probe.point, ctrl.signal)
      .then((c) => readValue(colormap, c, ctrl.signal))
      .then((v) => setReading({ state: "done", value: v }))
      .catch((e) => { if ((e as Error).name !== "AbortError") setReading({ state: "error", error: (e as Error).message }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer?.key, value.date, probeKey, readValue]);

  // Re-check when the field being looked at changes.
  useEffect(() => {
    if (status === "ok") void checkHere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey]);

  const latest = ranges ? lastDate(ranges) : null;
  const latestWithTiles = latestOk ?? (ranges && latest ? nearestDate(ranges, latest < todayUTC() ? latest : todayUTC()) : null);
  const period = ranges && value.date ? periodText(ranges, value.date) : null;
  const showTiles = layer?.gibs && value.date && ranges;
  const btn = "inline-flex min-h-9 items-center gap-1.5 rounded-ctl border border-line bg-glass-hi px-2.5 text-[13px] font-semibold "
    + "text-tx hover:bg-glass-sel max-sm:min-h-11";

  return (
    <>
      {showTiles && (
        <TileLayer key={`${layer.key}-${value.date}`} url={tileUrl(layer.gibs!, value.date!)} opacity={value.opacity}
          maxNativeZoom={layer.gibs!.maxNativeZoom} maxZoom={19} zIndex={2} eventHandlers={tileEvents} />
      )}
      {borders && <ReferenceLayers />}

      <div ref={box} className="absolute z-[600] flex max-h-[calc(100%-16px)] w-[320px] max-w-[calc(100%-16px)] flex-col-reverse gap-2"
        style={style ?? { left: 16, bottom: 16 }}>
        <button ref={pill} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}
          className="glass inline-flex min-h-11 items-center gap-2 self-start !rounded-[13px] px-3 py-2 text-left text-[13px] font-semibold">
          <Layers size={16} strokeWidth={1.75} className="shrink-0" />
          {layer ? <span>NASA: {layer.label}{layer.gibs && value.date ? <span className="font-medium text-mut"> · {formatDate(value.date)}</span> : null}</span>
            : <span>NASA data</span>}
          {(status === "dates" || status === "loading") && <Loader2 size={14} className="animate-spin text-mut" />}
        </button>

        {open && (
          <section id={panelId} aria-label="NASA data on the map"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                pill.current?.focus();
              }
            }}
            className="glass scroll-thin min-h-0 overflow-y-auto !rounded-[16px] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold">NASA data on the map</h2>
              <button type="button" aria-label="Close NASA data" onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx max-sm:h-11 max-sm:w-11">
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border border-line px-2.5 text-[13px] font-semibold">
              <input type="checkbox" checked={borders} onChange={(e) => onBorders(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-lime)]" />
              <span>
                Borders and place names
                <span className="block text-[12px] font-normal text-mut">Esri, HERE, Garmin, © OpenStreetMap contributors</span>
              </span>
            </label>
            <div role="radiogroup" aria-label="NASA layer" className="space-y-0.5">
              <LayerOption on={!layer} onClick={() => choose(null)} title="None" sub="Satellite imagery only" />
              {NASA_LAYERS.map((l) => (
                <LayerOption key={l.key} on={layer?.key === l.key} onClick={() => choose(l.key)} title={l.label}
                  sub={`${l.dataset} · ${l.pixelText}${l.gibs ? "" : " · link only"}`} />
              ))}
            </div>

            {layer && (
              <div className="mt-3 space-y-2.5 border-t border-line pt-3">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <KindTag kind={layer.kind} />
                  <span className="font-semibold">{layer.label}</span>
                </p>
                <p className="text-[12px] leading-snug text-mut">
                  NASA {layer.gibs ? "GIBS" : "Earthdata"} · {layer.product.shortName} v{layer.product.version}
                  {value.date && layer.gibs ? ` · ${formatDate(value.date)}` : ""}
                  {layer.units ? ` · ${layer.units}` : ""} · {layer.pixelText} pixels
                </p>
                <p className="text-[12px] leading-snug text-mut">{layer.kind === "modelled" ? "Modelled" : "Observed"}: {layer.kindReason}</p>

                {layer.gibs && ranges && (
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <label className="block">
                      <span className="mb-0.5 block text-[12px] text-mut">Date</span>
                      <input type="date" value={value.date ?? ""} min={firstDate(ranges) ?? undefined} max={[lastDate(ranges), todayUTC()].filter(Boolean).sort()[0] ?? undefined}
                        onChange={(e) => pickDate(e.target.value)}
                        className="w-full rounded-ctl border border-line bg-glass-hi px-2 py-1.5 text-sm text-tx [color-scheme:dark] max-sm:min-h-11" />
                    </label>
                    <label className="block w-[110px]">
                      <span className="mb-0.5 block text-[12px] text-mut">Opacity {Math.round(value.opacity * 100)}%</span>
                      <input type="range" min={0.2} max={1} step={0.05} value={value.opacity} aria-label="Layer opacity"
                        onChange={(e) => onChange({ ...value, opacity: Number(e.target.value) })} />
                    </label>
                  </div>
                )}
                {picked && value.date && (
                  <p className="text-[12px] leading-snug text-mut">
                    No {layer.dataset} data on {formatDate(picked)}; showing the closest earlier date, {formatDate(value.date)}.
                  </p>
                )}

                {layer.gibs && value.date && (
                  <div className="space-y-0.5 text-[12px] leading-snug" role="status">
                    <p><span className="text-mut">Showing</span> <span className="font-semibold">{formatDayWithAge(value.date)}</span>
                      {period && <span className="text-mut"> · NASA publishes it {period}</span>}</p>
                    {latestWithTiles && latestWithTiles !== value.date && (
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span><span className="text-mut">Latest from NASA</span> {formatDayWithAge(latestWithTiles)}</span>
                        <button type="button" className="font-semibold text-lime underline-offset-2 hover:underline max-sm:min-h-11"
                          onClick={() => { auto.current = { on: true, tries: 0 }; setPicked(null); onChange({ ...value, date: latestWithTiles }); }}>
                          Show latest
                        </button>
                      </p>
                    )}
                  </div>
                )}
                <StatusLine status={status} layer={layer} date={value.date} />
                {layer.gibs && layer.pixelKm < 1 && zoom < 10 && (
                  <div className="rounded-[12px] border border-line px-3 py-2 text-[12px] leading-snug" role="note">
                    <p className="text-tx">Zoom in to see this layer: its {layer.pixelText} pixels are too small to show at this zoom.</p>
                    {probe && (
                      <button type="button" className={`${btn} mt-1.5`}
                        onClick={() => map.setView(probe.point, 14, { animate: !matchMedia("(prefers-reduced-motion: reduce)").matches })}>
                        Zoom to {probe.label}
                      </button>
                    )}
                  </div>
                )}
                {status === "ok" && here.state === "empty" && value.date && (
                  <div className="rounded-[12px] border border-line px-3 py-2 text-[12px] leading-snug" role="status">
                    <p className="font-semibold text-tx">
                      Nothing drawn at {here.where} on {formatDate(value.date)}.
                    </p>
                    <p className="text-mut">
                      {layer.key === "imerg" ? "Under 0.1 mm/hr of rain or no data that day: NASA leaves both clear."
                        : layer.pixelKm < 0.1 ? "No clear satellite pass here that day (clouds or no overpass)."
                          : "NASA has no value for this spot on this date (for example, no satellite pass)."}
                    </p>
                    {search.state === "none" ? (
                      <p className="mt-1 text-mut">No data here in the last 20 dates NASA lists. Try another layer, or pick an earlier date.</p>
                    ) : (
                      <button type="button" disabled={search.state === "searching"} onClick={() => void findLatestHere()}
                        className={`${btn} mt-1.5`}>
                        {search.state === "searching" ? <><Loader2 size={13} className="animate-spin" /> Checking earlier dates ({search.checked} of up to 20)…</>
                          : layer.key === "imerg" ? "Find the latest day with rain here" : "Find the latest date with data here"}
                      </button>
                    )}
                  </div>
                )}

                {probe && layer.gibs?.colormap && value.date && !(here.state === "empty" && reading.value?.status === "transparent") && (
                  <div className="rounded-[12px] border border-line px-3 py-2" aria-live="polite">
                    <p className="text-[12px] text-mut">At {probe.label}, {formatDate(value.date)}</p>
                    {reading.state === "loading" && <p className="flex items-center gap-1.5 text-[13px] text-mut"><Loader2 size={13} className="animate-spin" /> Reading NASA&apos;s value…</p>}
                    {reading.state === "error" && <p className="text-[13px] text-alert">{reading.error}</p>}
                    {reading.state === "done" && reading.value && (
                      reading.value.status === "class" ? (
                        <>
                          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-[18px] font-extrabold">
                              {reading.value.title && /rain|snow/i.test(reading.value.title) ? `${reading.value.title.split(" ")[0]}: ` : ""}
                              {rangeText(reading.value)} {reading.value.units ?? (layer.units.startsWith("NDVI") ? "" : layer.units)}
                            </span>
                            <KindTag kind={layer.kind} />
                          </p>
                          {reading.value.units === "K" && <p className="text-[12px] text-mut">That&apos;s {celsius(reading.value)}.</p>}
                          <p className="mt-0.5 text-[12px] leading-snug text-mut">
                            NASA&apos;s colour class at this spot (pixel size: {layer.pixelText}), not a measurement of the field itself.
                          </p>
                        </>
                      ) : (
                        <p className="text-[13px]">
                          {reading.value.status === "unknown" ? "This colour isn't in NASA's key (it may sit on a class edge or a label)."
                            : reading.value.status === "nodata" ? "No data here on this date."
                              : `Nothing drawn here: ${reading.value.label?.toLowerCase() ?? "no data"}.`}
                        </p>
                      )
                    )}
                  </div>
                )}
                {probe && layer.gibs && !layer.gibs.colormap && (
                  <p className="text-[12px] text-mut">A natural-colour image has no value scale to read.</p>
                )}
                {!probe && layer.gibs?.colormap && (
                  <p className="text-[12px] text-mut">Select a field to read this layer&apos;s value there.</p>
                )}

                {layer.gibs?.legend && (
                  <figure>
                    {/* NASA's own colour key; light backing because the key's text is dark. */}
                    <img src={layer.gibs.legend} alt={`Colour key for ${layer.label}, in ${layer.units}, from NASA GIBS`}
                      className="w-full rounded-chip bg-tx p-1" />
                    <figcaption className="mt-1 text-[12px] text-mut">Colour key: NASA GIBS</figcaption>
                  </figure>
                )}
                <p className="text-[12px] leading-snug text-tx">{scaleNote(layer)}</p>
                {layer.note && <p className="text-[12px] leading-snug text-mut">{layer.note}</p>}

                <div className="flex flex-wrap gap-1.5">
                  {layer.gibs && (
                    <a className={btn} target="_blank" rel="noreferrer"
                      href={worldviewUrl(layer.gibs.id, value.date ?? undefined, {
                        west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() })}>
                      <ExternalLink size={14} strokeWidth={1.75} /> Open in NASA Worldview
                    </a>
                  )}
                  <a className={btn} target="_blank" rel="noreferrer" href={earthdataSearchUrl(layer.product.conceptId)}>
                    <ExternalLink size={14} strokeWidth={1.75} /> Earthdata Search
                  </a>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function LayerOption({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={`flex min-h-11 w-full flex-col justify-center rounded-[10px] border px-2.5 py-1.5 text-left ${
        on ? "border-white/12 bg-glass-sel" : "border-transparent hover:bg-glass-hi"}`}>
      <span className="text-[13px] font-semibold">{title}</span>
      <span className="text-[12px] text-mut">{sub}</span>
    </button>
  );
}

function StatusLine({ status, layer, date }: { status: Status; layer: NasaLayer; date: string | null }) {
  if (status === "dates" || status === "loading") {
    return <p className="flex items-center gap-1.5 text-[12px] text-mut" role="status"><Loader2 size={13} className="animate-spin" /> Loading NASA layer…</p>;
  }
  const problem = status === "offline" ? "Couldn't reach NASA GIBS. Check your connection, then pick the layer again."
    : status === "empty" && date ? `No ${layer.dataset} data for ${formatDate(date)} here. Try an earlier date.` : null;
  return problem ? (
    <p role="alert" className="flex gap-1.5 text-[12px] font-semibold leading-snug text-alert">
      <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" /> {problem}
    </p>
  ) : null;
}
