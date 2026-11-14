import { useId } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SeasonChartPoint {
  x: number;
  label: string;
  thisYear: number | null;
  lastYear: number | null;
  twoYearsAgo: number | null;
  normal: number | null;
  band: [number, number] | null;
}

const fmt = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : Array.isArray(v) ? v.map((x) => Number(x).toFixed(2)).join(" to ") : "");

/**
 * Season chart (DESIGN.md section 7): this season in lime with a soft area, the two previous years
 * in the comparison hues, the normal as a band and dashed line, and an optional dashed amber marker.
 * `ticks` places the x-axis labels; without it Recharts picks them.
 */
export function SeasonChart({ points, years, marker, ariaLabel, ticks, normalLabel = "Normal" }: {
  points: SeasonChartPoint[];
  years: [string, string, string];
  marker?: { x: number; label: string };
  ariaLabel: string;
  ticks?: { x: number; label: string }[];
  normalLabel?: string;
}) {
  const grad = useId().replace(/:/g, "");
  const last = points.reduce((idx, p, i) => (p.thisYear !== null ? i : idx), -1);
  const tickLabel = new Map(ticks?.map((t) => [t.x, t.label]));
  const names: Record<string, string> = { thisYear: years[0], lastYear: years[1], twoYearsAgo: years[2], normal: normalLabel, band: `${normalLabel} range` };
  const legend = [
    { label: years[0], cls: "bg-lime" },
    { label: years[1], cls: "bg-yr-1" },
    { label: years[2], cls: "bg-yr-2" },
    { label: normalLabel, cls: "bg-normal" },
  ];
  return (
    <div>
      <ul aria-hidden className="m-0 mb-1 mt-2 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[12px] text-mut">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5"><b className={`inline-block h-[3px] w-3 rounded-[2px] ${l.cls}`} />{l.label}</li>
        ))}
      </ul>
      <div className="h-[210px]" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-lime)" stopOpacity={0.35} />
                <stop offset="1" stopColor="var(--color-lime)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgb(255 255 255 / .08)" vertical={false} />
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} ticks={ticks?.map((t) => t.x)}
              tickFormatter={(x: number) => tickLabel.get(x) ?? ""} tick={{ fill: "var(--color-mut)", fontSize: 12 }}
              tickLine={false} axisLine={false} />
            <YAxis domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: "var(--color-mut)", fontSize: 12 }} tickLine={false} axisLine={false} width={30} />
            <Area dataKey="band" stroke="none" fill="var(--color-normal)" fillOpacity={0.22} isAnimationActive={false} activeDot={false} />
            <Line dataKey="normal" stroke="var(--color-normal)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line dataKey="twoYearsAgo" stroke="var(--color-yr-2)" strokeWidth={1.6} strokeOpacity={0.9} dot={false} isAnimationActive={false} />
            <Line dataKey="lastYear" stroke="var(--color-yr-1)" strokeWidth={1.6} strokeOpacity={0.9} dot={false} isAnimationActive={false} />
            <Area dataKey="thisYear" stroke="var(--color-lime)" strokeWidth={3} fill={`url(#${grad})`} isAnimationActive={false}
              dot={(p: { index: number; cx?: number; cy?: number }) =>
                p.index === last && p.cx != null && p.cy != null
                  ? <circle key="end" cx={p.cx} cy={p.cy} r={6} fill="var(--color-lime)" stroke="var(--color-ground)" strokeWidth={2} />
                  : <g key={p.index} />} />
            {marker && (
              <ReferenceLine x={marker.x} stroke="var(--color-watch-fill)" strokeDasharray="3 4"
                label={{ value: marker.label, position: "insideTopLeft", fill: "var(--color-watch)", fontSize: 12, fontWeight: 700 }} />
            )}
            <Tooltip
              contentStyle={{ background: "rgb(16 20 18 / .92)", border: "1px solid var(--color-line)", borderRadius: 10, fontSize: 13 }}
              labelStyle={{ color: "var(--color-tx)", fontWeight: 700 }}
              labelFormatter={(x) => points.find((p) => p.x === Number(x))?.label ?? ""}
              formatter={(v, key) => [fmt(v), names[String(key)] ?? String(key)]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
