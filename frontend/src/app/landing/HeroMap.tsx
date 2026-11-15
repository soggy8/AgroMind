import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";
import { NDVI_FILL, type NdviStep } from "../../shared/charts/ndvi";

export interface HeroField {
  id: string;
  name: string;
  boundary: [number, number][];
  step: NdviStep | null;
  chip?: string;
  tone?: "ok" | "watch" | "alert";
}

const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const WHITE = "#ffffff"; // Leaflet paths need a colour string, not a CSS variable.
const TONE_COLOR = { ok: "var(--color-ok)", watch: "var(--color-watch)", alert: "var(--color-alert)" } as const;

/** Still satellite backdrop for the landing hero: the demo farm's fields, coloured by observed greenness. */
export function HeroMap({ center, fields, padTopLeft, padBottomRight }: {
  center: [number, number];
  fields: HeroField[];
  padTopLeft: [number, number];
  padBottomRight: [number, number];
}) {
  // Zoomed out, full names collide: first the first word ("West 0.76"), then the value alone ("0.76").
  const [zoom, setZoom] = useState(15);
  return (
    <MapContainer center={center} zoom={15} zoomControl={false} attributionControl={false}
      dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false}
      className="absolute inset-0 z-0" aria-hidden>
      <TileLayer url={ESRI_IMAGERY} maxZoom={19} maxNativeZoom={18} />
      {fields.map((f) => (
        <Polygon key={`${f.id}-${f.step ?? "none"}`} positions={f.boundary} interactive={false}
          pathOptions={{
            color: WHITE, weight: 2, opacity: 1, fillColor: WHITE,
            fillOpacity: f.step !== null ? 0.72 : 0.06,
            className: f.step !== null ? NDVI_FILL[f.step] : undefined,
          }}>
          <Tooltip permanent direction="center" className="field-chip" opacity={1}>
            {zoom >= 15 ? f.name : zoom === 14 || !f.chip ? f.name.split(" ")[0] : null}
            {f.chip && <span style={{ ...(f.tone ? { color: TONE_COLOR[f.tone] } : {}), ...(zoom < 14 ? { marginLeft: 0 } : {}) }}>{f.chip}</span>}
          </Tooltip>
        </Polygon>
      ))}
      <Fit fields={fields} padTopLeft={padTopLeft} padBottomRight={padBottomRight} onZoom={setZoom} />
    </MapContainer>
  );
}

function Fit({ fields, padTopLeft, padBottomRight, onZoom }: {
  fields: HeroField[]; padTopLeft: [number, number]; padBottomRight: [number, number]; onZoom: (zoom: number) => void;
}) {
  const map = useMap();
  const key = fields.map((f) => f.id).join(",");
  const bounds = useMemo(() => {
    const pts = fields.flatMap((f) => f.boundary);
    return pts.length ? L.latLngBounds(pts) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [tl0, tl1] = padTopLeft;
  const [br0, br1] = padBottomRight;
  useEffect(() => {
    if (!bounds) return;
    const fit = () => {
      map.fitBounds(bounds, { paddingTopLeft: [tl0, tl1], paddingBottomRight: [br0, br1], maxZoom: 16, animate: false });
      onZoom(map.getZoom());
    };
    fit();
    map.on("resize", fit);
    return () => { map.off("resize", fit); };
  }, [bounds, map, tl0, tl1, br0, br1, onZoom]);
  return null;
}
