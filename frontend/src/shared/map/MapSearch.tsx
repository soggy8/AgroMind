/**
 * Shared map control, added by CropTwin: the search box. Your own farms and fields, and typed coordinates, never leave
 * the browser. Place names go through the `searchPlaces` function the page passes in. CropTwin's version calls the
 * backend /api/farms/places, which uses Nominatim on Enter only, under its usage policy (backend places.py).
 */
import L from "leaflet";
import { Loader2, MapPin, Search, Sprout, Tractor, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { LatLng } from "./BoundaryDraw";
import { t } from "../i18n";

/** One thing the search can jump to. `bounds` is [[south, west], [north, east]]. */
export interface SearchResult {
  id: string;
  kind: "farm" | "field" | "coordinates" | "place";
  title: string;
  subtitle?: string;
  point: LatLng;
  bounds?: [LatLng, LatLng];
}

/** Results from a place-name service, with the attribution its terms require. */
export interface PlaceResults { results: SearchResult[]; attribution: string }

/** "42.03, -93.46" or "42.03 -93.46" (latitude first, decimal degrees). */
export function parseCoordinates(text: string): LatLng | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

const ICON = { farm: Tractor, field: Sprout, coordinates: MapPin, place: MapPin } as const;

/**
 * Map search (DESIGN.md sections 6, 8 and 9). Your own farms and fields match as you type (nothing leaves the
 * browser); typed coordinates are recognised; place names are looked up only when you press Enter, because the
 * place service forbids search-as-you-type. Keyboard: arrows move, Enter chooses, Escape closes.
 * Render inside a react-leaflet map.
 */
export function MapSearch({ local, searchPlaces, onPick, style }: {
  local: SearchResult[];
  searchPlaces: (q: string, signal: AbortSignal) => Promise<PlaceResults>;
  onPick: (r: SearchResult) => void;
  style?: CSSProperties;
}) {
  const box = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // -1: nothing highlighted yet
  const [places, setPlaces] = useState<PlaceResults | null>(null);
  const [placesFor, setPlacesFor] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!box.current) return;
    L.DomEvent.disableClickPropagation(box.current);
    L.DomEvent.disableScrollPropagation(box.current);
  }, []);

  const text = q.trim().toLowerCase();
  const coords = parseCoordinates(q);
  const results: SearchResult[] = [
    ...(coords ? [{ id: "coords", kind: "coordinates" as const, title: `${coords[0]}, ${coords[1]}`, subtitle: t("Coordinates"), point: coords }] : []),
    ...(text.length >= 1 ? local.filter((r) => r.title.toLowerCase().includes(text)).slice(0, 6) : []),
    ...(placesFor === q.trim() && places ? places.results : []),
  ];

  const runPlaceSearch = async () => {
    const query = q.trim();
    if (query.length < 2 || coords || placesFor === query) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStatus("searching");
    setProblem(null);
    try {
      const found = await searchPlaces(query, ctrl.signal);
      setPlaces(found);
      setPlacesFor(query);
      setStatus("idle");
      setOpen(true);
      setActive(-1);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStatus("error");
      setProblem((e as Error).message);
    }
  };

  const choose = (r: SearchResult) => {
    onPick(r);
    setOpen(false);
    setActive(-1);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // A highlighted result is chosen; typed coordinates go straight there; otherwise look up place names.
      if (open && active >= 0 && results[active]) choose(results[active]);
      else if (coords) choose(results[0]);
      else void runPlaceSearch();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const searchedNothing = placesFor === q.trim() && places && places.results.length === 0 && results.length === 0;
  const showList = open && q.trim() && (results.length > 0 || searchedNothing || status !== "idle");

  return (
    <div ref={box} className="absolute z-[650] w-[340px] max-w-[calc(100%-16px)]" style={style ?? { left: 16, top: 16 }}>
      <div className="glass flex items-center gap-2 !rounded-[13px] px-3">
        {status === "searching" ? <Loader2 size={16} className="shrink-0 animate-spin text-mut" />
          : <Search size={16} strokeWidth={1.75} className="shrink-0 text-mut" />}
        <input type="search" role="combobox" aria-expanded={!!showList} aria-controls={listId} aria-label={t("Search places, farms, fields or coordinates")}
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          placeholder={t("Search a place, farm, field or lat, lon")} value={q}
          onChange={(e) => { setQ(e.target.value); setActive(-1); setOpen(true); setProblem(null); setStatus("idle"); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          className="min-h-11 w-full bg-transparent text-sm text-tx placeholder:text-mut/80 focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
        {q && (
          <button type="button" aria-label={t("Clear search")} onClick={() => { setQ(""); setPlaces(null); setPlacesFor(null); setProblem(null); }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx max-sm:h-11 max-sm:w-11">
            <X size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {showList && (
        <div className="glass mt-1.5 overflow-hidden !rounded-[13px]">
          {results.length > 0 && (
            <ul id={listId} role="listbox" aria-label={t("Search results")} className="scroll-thin max-h-[300px] overflow-y-auto p-1">
              {results.map((r, i) => {
                const Icon = ICON[r.kind];
                return (
                  <li key={`${r.kind}-${r.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                    // pointerdown, not click: the map stops mousedown/click from leaving this box, so a click
                    // never reached the result and the map stayed put.
                    onPointerDown={(e) => { e.preventDefault(); choose(r); }} onMouseEnter={() => setActive(i)}
                    className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-[10px] px-2.5 py-2 ${i === active ? "bg-glass-sel" : ""}`}>
                    <Icon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mut" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{t(r.title)}</span>
                      {r.subtitle && <span className="block truncate text-[12px] text-mut">{r.subtitle}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-line px-3 py-2 text-[12px] leading-snug text-mut" aria-live="polite">
            {status === "searching" ? t("Searching places…")
              : problem ? <span className="text-alert">{problem}</span>
                : searchedNothing ? t("No places found. Check the spelling, or type coordinates like 42.03, -93.46.")
                  : placesFor === q.trim() && places ? t("Places: {attribution}", { attribution: places.attribution })
                    : !coords && q.trim().length >= 2 ? t("Press Enter to search place names.") : t("Your farms and fields match as you type.")}
          </div>
        </div>
      )}
    </div>
  );
}
