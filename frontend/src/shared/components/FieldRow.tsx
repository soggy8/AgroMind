import { NDVI_FILL, type NdviStep } from "../charts/ndvi";

const toneText = { watch: "text-watch", alert: "text-alert", ok: "text-ok" } as const;

/** Fits a [lat, lon] ring into the 40 x 32 thumbnail, keeping its shape. */
function thumbPoints(ring: [number, number][]): string {
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = ring.map(([lat, lon]) => [lon * k, -lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const w = Math.max(...xs) - x0 || 1;
  const h = Math.max(...ys) - y0 || 1;
  const s = Math.min(34 / w, 26 / h);
  const [ox, oy] = [(40 - w * s) / 2, (32 - h * s) / 2];
  return xy.map(([x, y]) => `${(ox + (x - x0) * s).toFixed(1)},${(oy + (y - y0) * s).toFixed(1)}`).join(" ");
}

const DEFAULT_SHAPE = "3,4 36,2 37,29 4,30";

/**
 * Field row (DESIGN.md section 6): 40px field-shape thumbnail filled with its NDVI colour,
 * name and "Crop · ha", value and delta right-aligned. Selected = glass-sel fill and hairline.
 */
export function FieldRow({ name, meta, value, delta, deltaNote, ndviStep, tone, selected, onSelect, shape }: {
  name: string;
  meta: string;
  value: string;
  delta?: string;
  deltaNote?: string; // read by screen readers and shown on hover after the delta, e.g. "vs normal"
  ndviStep: NdviStep | null;
  tone?: "watch" | "alert" | "ok";
  selected: boolean;
  onSelect: () => void;
  shape?: [number, number][];
}) {
  const fill = ndviStep === null ? "fill-glass-hi" : NDVI_FILL[ndviStep];
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect}
      className={`grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 rounded-[14px] border px-2.5 py-[11px] text-left transition-colors ${
        selected ? "border-line bg-glass-sel" : "border-transparent hover:bg-glass-hi"
      }`}>
      <svg width="40" height="32" viewBox="0 0 40 32" aria-hidden>
        <polygon points={shape && shape.length > 2 ? thumbPoints(shape) : DEFAULT_SHAPE} className={`${fill} stroke-tx`}
          strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold">{name}</span>
        <span className="mt-px block text-[13px] font-medium leading-snug text-mut [text-wrap:pretty]">{meta}</span>
      </span>
      <span className="text-right">
        <span className="block text-[18px] font-extrabold tracking-[-.01em]">{value}</span>
        {delta && (
          <span className={`block text-[12px] font-bold ${tone ? toneText[tone] : "text-mut"}`} title={deltaNote ? `${delta} ${deltaNote}` : undefined}>
            {delta}{deltaNote && <span className="sr-only"> {deltaNote}</span>}
          </span>
        )}
      </span>
    </button>
  );
}
