import type { Assumption } from "../types";

/** Every rule and assumed value behind the screen, with its source (DESIGN.md section 8). */
export function HowWorkedOut({ assumptions, sources }: { assumptions: Assumption[]; sources: string[] }) {
  return (
    <section aria-labelledby="cd-how-h">
      <h3 id="cd-how-h" className="text-[15px] font-bold">How this was worked out</h3>
      <dl className="m-0 mt-1">
        {assumptions.map((a) => (
          <div key={a.topic} className="border-b border-line py-2.5 last:border-0">
            <dt className="text-sm font-semibold">{a.topic}</dt>
            <dd className="m-0 mt-0.5 text-[13px] leading-normal text-tx/90">{a.text}</dd>
            <dd className="m-0 mt-0.5 text-[12px] text-mut">{a.source}</dd>
          </div>
        ))}
      </dl>
      {sources.length > 0 && (
        <>
          <h4 className="mt-3 text-sm font-semibold">Data sources</h4>
          <ul className="m-0 mt-1 list-none space-y-1 p-0 text-[12px] leading-normal text-mut">
            {sources.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
