import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct } from "../lib/format";
import { rotationColor } from "../lib/rotationColors";
import type { SimulationResult } from "../types";
import { t } from "../../../shared/i18n";

/**
 * How each rotation fares depending on which historical year the run starts in: the spread behind
 * the p10–p90 ranges. A run starting in 2012 meets the 2012 drought in its first season.
 */
export function WeatherYearsChart({ result, onYear }: { result: SimulationResult; onYear?: (year: number) => void }) {
  const rots = [...result.rotations].sort((a, b) => a.input_index - b.input_index);
  const data = result.ensemble_start_years.map((year, i) => {
    const row: Record<string, number> = { year };
    for (const r of rots) row[r.rotation_id] = r.by_start_year[i];
    return row;
  });
  const all = rots.flatMap((r) => r.by_start_year);
  const lo = Math.floor(Math.min(...all, 1) * 10) / 10;
  const hi = Math.ceil(Math.max(...all, 1) * 10) / 10;
  return (
    <section aria-labelledby="years-h">
      <h3 id="years-h" className="text-[15px] font-bold">{t("By starting weather year")}</h3>
      <p className="text-[12px] text-mut">{t("Average yield over the run, if it starts in that year's weather.")}{onYear && t(" Click a year to replay it.")}</p>
      <div className="mt-2 h-[170px]" role="img"
        aria-label={t("Line chart of yield by starting weather year for {length} rotations", { length: rots.length })}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} style={onYear ? { cursor: "pointer" } : undefined}
            onClick={(e) => { const y = Number(e?.activeLabel); if (onYear && Number.isFinite(y)) onYear(y); }}>
            <CartesianGrid stroke="rgb(255 255 255 / .08)" vertical={false} />
            <XAxis dataKey="year" tick={{ fill: "var(--color-mut)", fontSize: 12 }} tickLine={false}
              axisLine={false} interval={5} />
            <YAxis domain={[lo, hi]} tickFormatter={(v: number) => pct(v)} tick={{ fill: "var(--color-mut)", fontSize: 12 }}
              tickLine={false} axisLine={false} width={44} />
            <ReferenceLine y={1} stroke="var(--color-normal)" strokeDasharray="4 4" />
            <ReferenceLine x={2012} stroke="var(--color-watch-fill)" strokeDasharray="3 4"
              label={{ value: t("2012 drought"), position: "insideTopRight", fill: "var(--color-watch)", fontSize: 12, fontWeight: 700 }} />
            <Tooltip
              contentStyle={{ background: "rgb(16 20 18 / .92)", border: "1px solid var(--color-line)", borderRadius: 10, fontSize: 13 }}
              labelStyle={{ color: "var(--color-tx)", fontWeight: 700 }}
              formatter={(v, id) => [pct(Number(v)), rots.find((r) => r.rotation_id === id)?.name ?? String(id)]}
              labelFormatter={(y) => t("Starting in {y}", { y: String(y) })} />
            {rots.map((r) => (
              <Line key={r.rotation_id} dataKey={r.rotation_id} stroke={rotationColor(r.input_index)}
                strokeWidth={r.rank === 1 ? 2.6 : 1.6} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[12px] text-mut">{t("Dashed line: typical yield in today's climate (100%).")}</p>
    </section>
  );
}
