import { Droplets, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Drawer, KindTag } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { simulatorApi } from "../api/simulatorApi";
import { pct } from "../lib/format";
import type { Sim } from "../state/useSimulator";
import type { IrrigationPlan } from "../types";

/** Irrigation planner: yield against seasonal water cap for one rotation, and the least water that hits a target. */
export function IrrigationDrawer({ sim, onClose }: { sim: Sim; onClose: () => void }) {
  const u = useUnits();
  const { draft, farmId } = sim;
  const [rotationId, setRotationId] = useState(draft?.rotations[0]?.id ?? "");
  const [target, setTarget] = useState(0.9);
  const [plan, setPlan] = useState<IrrigationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rotation = draft?.rotations.find((r) => r.id === rotationId) ?? draft?.rotations[0];

  const load = useCallback(async () => {
    if (!draft || !rotation) return;
    setBusy(true);
    setError(null);
    try {
      setPlan(await simulatorApi.irrigationPlan(farmId, {
        field_id: draft.fieldId, rotation, scenario: draft.scenario, target_share: target, units: u.system,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [draft, rotation, farmId, target, u.system]);

  useEffect(() => { void load(); }, [load]);
  if (!draft || !rotation) return null;

  const data = plan?.points.map((p, i) => ({
    x: i, label: p.cap_mm === null ? "No limit" : u.water(p.cap_mm),
    yield: p.relative_yield.p50, low: p.relative_yield.p10, used: u.waterValue(p.irrigation_mm_per_year),
  })) ?? [];

  return (
    <Drawer title="Irrigation planner" icon={<Droplets size={18} strokeWidth={1.75} className="text-water" />} onClose={onClose} width={500}>
      <p className="text-[13px] leading-normal text-mut">
        How much yield each amount of irrigation buys back in the current scenario, and the least water that keeps
        the rotation at your target. Water is the seasonal cap; the farm only pumps when the soil runs low.
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
        <label className="text-sm font-semibold">
          Rotation
          <select value={rotation.id} onChange={(e) => setRotationId(e.target.value)}
            className="mt-1 block w-full rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm">
            {draft.rotations.map((r) => <option key={r.id} value={r.id} className="bg-ground">{r.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Target yield
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))}
            className="mt-1 block rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm">
            {[0.8, 0.85, 0.9, 0.95, 1.0].map((t) => <option key={t} value={t} className="bg-ground">{pct(t)} of typical</option>)}
          </select>
        </label>
      </div>

      {busy && <p className="mt-5 flex items-center gap-2 text-[13px] text-mut" role="status"><Loader2 size={16} className="animate-spin" /> Simulating nine irrigation levels…</p>}
      {error && <p role="alert" className="mt-4 text-[13px] text-alert">{error}</p>}

      {plan && !busy && (
        <>
          <div className={`mt-4 rounded-chip border p-3 text-sm leading-normal ${plan.reaches_target ? "border-water/40 bg-water/10" : "border-watch/40 bg-watch/10"}`}>
            {plan.summary}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">Yield by irrigation cap</h3>
            <KindTag kind="modelled" />
          </div>
          <div className="mt-2 h-[200px]" role="img" aria-label="Line chart of yield against irrigation cap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgb(255 255 255 / .08)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--color-mut)", fontSize: 11 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tickFormatter={(v: number) => pct(v)} tick={{ fill: "var(--color-mut)", fontSize: 12 }} tickLine={false}
                  axisLine={false} width={44} domain={["auto", "auto"]} />
                <ReferenceLine y={target} stroke="var(--color-lime)" strokeDasharray="4 4"
                  label={{ value: "target", position: "insideTopLeft", fill: "var(--color-lime)", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "rgb(16 20 18 / .92)", border: "1px solid var(--color-line)", borderRadius: 10, fontSize: 13 }}
                  formatter={(v, k) => [pct(Number(v)), k === "yield" ? "Typical year (p50)" : "Bad year (p10)"]} />
                <Line dataKey="yield" stroke="var(--color-water)" strokeWidth={2.6} dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="low" stroke="var(--color-water)" strokeOpacity={0.5} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[12px] text-mut">Solid: typical year (p50). Dashed: a bad year (p10).</p>
          <table className="mt-3 w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-mut">
                <th className="pb-1 font-semibold">Cap per season</th>
                <th className="pb-1 text-right font-semibold">Water used / yr</th>
                <th className="pb-1 text-right font-semibold">Yield</th>
                <th className="pb-1 text-right font-semibold">Pumping cost</th>
              </tr>
            </thead>
            <tbody>
              {plan.points.map((p) => {
                const hit = p.cap_mm === plan.recommended_cap_mm && plan.reaches_target;
                return (
                  <tr key={String(p.cap_mm)} className={`border-t border-line ${hit ? "font-bold text-water" : ""}`}>
                    <td className="py-1.5">{p.cap_mm === null ? "No limit" : p.cap_mm === 0 ? "None" : u.water(p.cap_mm)}{hit && " ← least water"}</td>
                    <td className="py-1.5 text-right">{u.water(p.irrigation_mm_per_year)}</td>
                    <td className="py-1.5 text-right">{pct(p.relative_yield.p50)}</td>
                    <td className="py-1.5 text-right">{u.moneyPerArea(p.water_cost_per_ha_year)}{u.moneyUnit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] leading-snug text-mut">{plan.cost_source.replace(/^ASSUME: /, "Assumed: ")}</p>
        </>
      )}
    </Drawer>
  );
}
