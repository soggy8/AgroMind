import type { SimulationResult } from "../types";

/** Every rule and assumed value behind the result, with its source (DESIGN.md section 8). */
export function AssumptionsList({ result }: { result: SimulationResult }) {
  const econ = result.rotations.find((r) => r.economics)?.economics;
  return (
    <section aria-labelledby="assump-h">
      <h3 id="assump-h" className="text-[15px] font-bold">How these numbers are made</h3>
      <p className="mt-1 text-[13px] leading-normal text-mut">{result.data_note}</p>
      <dl className="mt-2">
        {result.assumptions.map((a) => (
          <div key={a.topic} className="border-b border-line py-2.5 last:border-0">
            <dt className="text-sm font-semibold">{a.topic}</dt>
            <dd className="mt-0.5 text-[13px] leading-normal text-tx/90">{a.text}</dd>
            <dd className="mt-0.5 text-[12px] text-mut">{a.source}</dd>
          </div>
        ))}
        {econ && (
          <div className="py-2.5">
            <dt className="text-sm font-semibold">Economics sources</dt>
            <dd className="mt-0.5 text-[12px] leading-normal text-mut">Prices: {econ.price_source}</dd>
            <dd className="mt-0.5 text-[12px] leading-normal text-mut">Costs: {econ.cost_source}</dd>
            {econ.notes.map((n) => <dd key={n} className="mt-0.5 text-[12px] text-mut">{n}</dd>)}
          </div>
        )}
      </dl>
      <p className="mt-2 text-[12px] text-mut">Model version {result.model_version}.</p>
    </section>
  );
}
