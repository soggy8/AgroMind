import { AlertTriangle, Calculator, RefreshCw, Satellite, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { TopBar } from "../../../app/TopBar";
import type { Route } from "../../../app/route";
import { Button, Glass, InfoTip, KindTag, SegmentedTabs, Skeleton } from "../../../shared/components";
import { t } from "../../../shared/i18n";
import { type Units as UnitFormat, useUnits } from "../../../shared/units";
import { rotationColor } from "../../simulator/lib/rotationColors";
import type { ProjectionInfo } from "../../simulator/types";
import { type Draft, perHaToPerAc, perTToPerBu, useEconomics } from "../state/useEconomics";
import type { BadYears, ClimateBill, EconomicsDefaults, EconomicsReport, RotationInput, Stat, WhoEarnsMost } from "../types";

const inputCls = "w-full rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm text-tx placeholder:text-mut/80 max-sm:min-h-11";
const MINUS = "−";
const PRICED = ["maize", "soybean", "oats"] as const;
const CROP_NAME: Record<string, string> = { maize: t("Maize"), soybean: t("Soybean"), oats: t("Oats") };

/** "$310/ha" in the chosen units; negative values get a real minus sign. */
const perArea = (u: UnitFormat, usdHa: number) => `${u.moneyPerArea(usdHa)}${u.moneyUnit}`;
/** "+$40/ha" / "−$190/ha": changes always carry a sign (DESIGN.md section 8, rule 6). */
const signedPerArea = (u: UnitFormat, usdHa: number) => {
  const r = Math.round(u.moneyValue(usdHa));
  return r === 0 ? `$0${u.moneyUnit}` : `${r > 0 ? "+" : ""}${perArea(u, usdHa)}`;
};
const dollars = (usd: number, signed = false) => {
  const r = Math.round(usd);
  const sign = r < 0 ? MINUS : signed && r > 0 ? "+" : "";
  return `${sign}$${Math.abs(r).toLocaleString("en-US")}`;
};
const pct = (share: number) => `${Math.round(share * 100)}%`;

/** Short rotation label for the grid cells, e.g. "M–S–O +rye". The full name is in the legend. */
const shortName = (r: RotationInput) =>
  r.crops.map((c) => (CROP_NAME[c] ?? c).charAt(0).toUpperCase()).join("–") + (r.cover_crop ? " +rye" : "");

/**
 * Farm money (docs/modules/economics.md): the Simulator's 25 replayed weather years turned into dollars.
 * Leads with change versus today's climate and differences between rotations, never a price or yield forecast.
 */
export function EconomicsPage({ farmId, route, onNavigate }: { farmId: string; route: Route; onNavigate: (r: Route) => void }) {
  const u = useUnits();
  const econ = useEconomics(farmId, u.system);
  const { state, draft, patch } = econ;
  const report = state.report;
  const colorOf = (id: string) => rotationColor(Math.max(0, state.reportRotations.findIndex((r) => r.id === id)));

  return (
    <div className="flex min-h-full flex-col">
      <TopBar route={route} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-10 pt-6 lg:px-5">
        <header className="anim-in px-1">
          <p className="text-[12.5px] font-bold uppercase tracking-[.08em] text-lime">{t("Farm money")}</p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-[-.02em] sm:text-[34px]">
            {t("What the climate shift could cost, in dollars")}
          </h1>
          <p className="mt-1 max-w-[70ch] text-[14px] leading-normal text-mut">
            {t("Each rotation is replayed over 25 years of real NASA weather, today and in the scenario, then priced with USDA prices and Iowa State costs, or your own numbers. These are scenario margins to compare rotations, not forecasts of prices or harvests.")}
          </p>
        </header>

        {state.loadError ? (
          <Glass className="mt-6 max-w-xl p-5">
            <p className="flex items-center gap-2 font-bold"><AlertTriangle size={16} strokeWidth={1.75} className="text-watch" />{t("Couldn't load farm money")}</p>
            <p className="mt-1 text-sm text-mut">{t(state.loadError)}</p>
          </Glass>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Glass as="aside" className="h-max p-4 lg:sticky lg:top-24" aria-label={t("Money settings")}>
              {draft && state.defaults ? (
                <Controls draft={draft} defaults={state.defaults} fields={state.fields} projections={state.projections}
                  patch={patch} running={state.running} onRun={() => void econ.run()} u={u} />
              ) : <ControlsSkeleton />}
            </Glass>

            <div className="flex min-w-0 flex-col gap-4" aria-busy={state.running || undefined} aria-live="polite">
              {state.runError && (
                <Glass className="p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} strokeWidth={1.75} className="text-watch" />{state.runError}</p>
                </Glass>
              )}
              {!report ? <ResultsSkeleton /> : (
                <div className={`flex flex-col gap-4 transition-opacity ${state.running ? "opacity-60" : ""}`}>
                  <ReportHeader report={report} u={u} />
                  <ClimateBillBlock bill={report.climate_bill} report={report} u={u} />
                  <BadYearsBlock rows={report.bad_years} colorOf={colorOf} u={u} />
                  {report.who_earns_most ? (
                    <GridBlock grid={report.who_earns_most} rotations={state.reportRotations.filter((r) => report.bad_years.some((b) => b.rotation_id === r.id))}
                      colorOf={colorOf} u={u} />
                  ) : (
                    <Glass className="p-5 text-sm text-mut">{t("Add a second rotation with priced crops to see which one earns most across warming and prices.")}</Glass>
                  )}
                  <InputsBlock report={report} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- controls ----------

function Section({ title, kind, tip, children }: { title: string; kind?: "scenario" | "observed"; tip?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 text-[15px] font-bold">
          {title}
          {tip && <InfoTip label={title}>{tip}</InfoTip>}
        </h2>
        {kind && <KindTag kind={kind} />}
      </div>
      {children}
    </section>
  );
}

function Range({ id, label, value, display, min, max, step, color, onChange }: {
  id: string; label: string; value: number; display: string; min: number; max: number; step: number; color: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
          <i aria-hidden className="h-2 w-2 rounded-[3px]" style={{ background: color }} />{label}
        </label>
        <output htmlFor={id} className="text-[15px] font-extrabold">{display}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))} style={{ ["--slider-color" as string]: color }} />
    </div>
  );
}

function Controls({ draft, defaults, fields, projections, patch, running, onRun, u }: {
  draft: Draft; defaults: EconomicsDefaults; fields: { id: string; name: string; area_ha: number }[];
  projections: ProjectionInfo[]; patch: (p: Partial<Draft>) => void; running: boolean; onRun: () => void; u: UnitFormat;
}) {
  const us = u.system === "us";
  const input = (id: string) => defaults.inputs.find((i) => i.id === id);
  const priceHint = (crop: string) => {
    const v = input(`price.${crop}`)?.value;
    return v === undefined ? "" : us ? perTToPerBu(v, crop).toFixed(2) : v.toFixed(0);
  };
  const costHint = (crop: string) => {
    const v = input(`cost.${crop}`)?.value;
    return v === undefined ? "" : (us ? perHaToPerAc(v) : v).toFixed(0);
  };
  const rentDefault = input("rent")?.value;
  const proj = projections.find((p) => p.id === draft.projection);
  const toggleCover = (id: string) =>
    patch({ rotations: draft.rotations.map((r) => (r.id === id ? { ...r, cover_crop: !r.cover_crop } : r)) });

  return (
    <div className="flex flex-col gap-3">
      <Section title={t("Field")} kind="observed">
        <select aria-label={t("Field")} className={inputCls} value={draft.fieldId} onChange={(e) => patch({ fieldId: e.target.value })}>
          {fields.map((f) => <option key={f.id} value={f.id}>{f.name} · {u.area(f.area_ha)}</option>)}
        </select>
        <p className="mt-1 text-[12px] text-mut">{t("Area from the farm profile (CropTwin).")}</p>
      </Section>

      <Section title={t("Rotations")} tip={t("The one marked yours is what the climate bill is about; the others are the alternatives it is compared with. Winter wheat and sunflower have no Iowa price data, so only maize, soybean and oats are priced.")}>
        <ul className="flex flex-col gap-1" role="list">
          {draft.rotations.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 rounded-ctl border px-2.5 py-2 ${r.id === draft.yoursId ? "border-white/20 bg-glass-sel" : "border-line"}`}>
              <input type="radio" name="yours" id={`yours-${r.id}`} checked={r.id === draft.yoursId} onChange={() => patch({ yoursId: r.id })}
                className="accent-[var(--color-lime)]" />
              <label htmlFor={`yours-${r.id}`} className="min-w-0 flex-1 text-sm font-semibold">
                {r.name}
                {r.id === draft.yoursId && <span className="ml-1.5 text-[12px] font-bold text-lime">{t("yours")}</span>}
              </label>
              <label className="flex items-center gap-1 text-[12px] text-mut">
                <input type="checkbox" checked={!!r.cover_crop} onChange={() => toggleCover(r.id)} className="accent-[var(--color-lime)]" />
                {t("rye")}
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("Climate")} kind="scenario">
        {projections.length > 0 && (
          <SegmentedTabs<Draft["source"]> label={t("Scenario source")} size="sm" value={draft.source} className="mb-2"
            items={[
              { id: "projection", label: <span className="inline-flex items-center gap-1.5"><Satellite size={13} strokeWidth={1.75} />{t("NASA projection")}</span> },
              { id: "sliders", label: <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={13} strokeWidth={1.75} />{t("Set it yourself")}</span> },
            ]}
            onChange={(source) => patch({ source })} />
        )}
        {draft.source === "projection" ? (
          <>
            <select aria-label={t("NASA projection")} className={inputCls} value={draft.projection ?? ""} onChange={(e) => patch({ projection: e.target.value })}>
              {projections.map((p) => <option key={p.id} value={p.id}>{p.period} · {p.ssp_name}</option>)}
            </select>
            {proj && (
              <p className="mt-1.5 text-[12px] leading-snug text-mut">
                {t("Growing season {temp}, rain {rain}%, median of {n} climate models (NASA NEX-GDDP-CMIP6).", {
                  temp: u.tempDelta(proj.temp_change_c.median), rain: `${proj.rain_change_pct.median > 0 ? "+" : ""}${proj.rain_change_pct.median.toFixed(0)}`, n: proj.models,
                })}
              </p>
            )}
          </>
        ) : (
          <>
            <Range id="econ-temp" label={t("Temperature")} color="var(--color-heat)" min={-1} max={5} step={0.5} value={draft.temp}
              display={u.tempDelta(draft.temp)} onChange={(temp) => patch({ temp })} />
            <Range id="econ-rain" label={t("Rainfall")} color="var(--color-rain)" min={-50} max={30} step={5} value={draft.rain}
              display={`${draft.rain > 0 ? "+" : draft.rain < 0 ? MINUS : ""}${Math.abs(draft.rain)}%`} onChange={(rain) => patch({ rain })} />
          </>
        )}
        <div className="mt-2">
          <div className="mb-1 flex items-center gap-1 text-[13px] font-semibold">
            {t("Crops' response to heat")}
            <InfoTip label={t("Response to heat")}>
              {t("US research finds maize loses about 10% of yield per °C of warming (Zhao et al. 2017); this county's own yields barely dropped in hot years. The climate bill shows the other one too.")}
            </InfoTip>
          </div>
          <SegmentedTabs label={t("Crops' response to heat")} size="sm" value={draft.heat}
            items={[{ id: "published", label: t("US research") }, { id: "local", label: t("This county") }]}
            onChange={(heat) => patch({ heat })} />
        </div>
      </Section>

      <Section title={t("Prices and land")} kind="scenario"
        tip={t("Leave a box empty to use the default shown in grey: USDA WASDE prices and Iowa State University 2026 costs and cash rent.")}>
        <Range id="econ-price" label={t("All crop prices")} color="var(--color-soil)" min={-40} max={40} step={5} value={draft.priceChange}
          display={`${draft.priceChange > 0 ? "+" : draft.priceChange < 0 ? MINUS : ""}${Math.abs(draft.priceChange)}%`}
          onChange={(priceChange) => patch({ priceChange })} />
        <SegmentedTabs label={t("Land")} size="sm" value={draft.land} className="my-2"
          items={[{ id: "rent", label: t("I rent the land") }, { id: "own", label: t("I own it") }]}
          onChange={(land) => patch({ land })} />
        {draft.land === "rent" && (
          <label className="mb-2 block text-[13px] font-semibold">
            {t("Cash rent ({unit})", { unit: us ? "$/ac" : "$/ha" })}
            <input inputMode="decimal" className={`${inputCls} mt-1`} value={draft.rent}
              placeholder={rentDefault !== undefined ? (us ? perHaToPerAc(rentDefault) : rentDefault).toFixed(0) : ""}
              onChange={(e) => patch({ rent: e.target.value })} />
          </label>
        )}
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-mut">
              <th scope="col" className="pb-1 font-semibold">{t("Crop")}</th>
              <th scope="col" className="pb-1 pl-2 font-semibold">{t("Price ({unit})", { unit: us ? "$/bu" : "$/t" })}</th>
              <th scope="col" className="pb-1 pl-2 font-semibold">{t("Cost before rent ({unit})", { unit: us ? "$/ac" : "$/ha" })}</th>
            </tr>
          </thead>
          <tbody>
            {PRICED.map((crop) => (
              <tr key={crop}>
                <th scope="row" className="py-1 pr-1 text-left font-semibold">{CROP_NAME[crop]}</th>
                <td className="py-1 pl-2">
                  <input inputMode="decimal" aria-label={t("{crop} price", { crop: CROP_NAME[crop] })} className={`${inputCls} !px-2 !py-1.5`}
                    value={draft.prices[crop] ?? ""} placeholder={priceHint(crop)}
                    onChange={(e) => patch({ prices: { ...draft.prices, [crop]: e.target.value } })} />
                </td>
                <td className="py-1 pl-2">
                  <input inputMode="decimal" aria-label={t("{crop} cost before rent", { crop: CROP_NAME[crop] })} className={`${inputCls} !px-2 !py-1.5`}
                    value={draft.costs[crop] ?? ""} placeholder={costHint(crop)}
                    onChange={(e) => patch({ costs: { ...draft.costs, [crop]: e.target.value } })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Button variant="primary" onClick={onRun} disabled={running} className="mt-1 w-full">
        {running ? <RefreshCw size={16} strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" /> : <Calculator size={16} strokeWidth={1.75} />}
        {running ? t("Working it out…") : t("Work out the money")}
      </Button>
    </div>
  );
}

function ControlsSkeleton() {
  return <div className="space-y-3" aria-busy="true">{["h-10", "h-24", "h-28", "h-20", "h-10"].map((h, i) => <Skeleton key={i} className={`w-full ${h}`} />)}</div>;
}

function ResultsSkeleton() {
  return (
    <Glass className="space-y-3 p-5" aria-busy="true" aria-label={t("Working out the money")}>
      <Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-full" /><Skeleton className="h-24 w-full" />
      <p className="text-[13px] text-mut">{t("Replaying 25 weather years for every rotation, today and in the scenario…")}</p>
    </Glass>
  );
}

// ---------- results ----------

function BlockHead({ id, n, title, kind, sub }: { id: string; n: number; title: string; kind: "modelled" | "scenario"; sub?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id={id} className="text-[18px] font-bold tracking-[-.01em]"><span aria-hidden className="mr-2 text-mut">{n}</span>{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-mut">{sub}</p>}
      </div>
      <KindTag kind={kind} />
    </div>
  );
}

function ReportHeader({ report, u }: { report: EconomicsReport; u: UnitFormat }) {
  return (
    <Glass className="p-4">
      <p className="text-[13px] text-mut">
        <span className="font-semibold text-tx">{report.field_name}</span> · {u.area(report.area.value_ha)}
        {" "}<KindTag kind="observed" className="ml-1 align-middle" /> · {t("Scenario")}: <span className="font-semibold text-tx">{report.scenario_label}</span>
        {" "}<KindTag kind="scenario" className="ml-1 align-middle" />
        {report.price_change_pct !== 0 && <> · {t("prices {v}%", { v: `${report.price_change_pct > 0 ? "+" : MINUS}${Math.abs(report.price_change_pct)}` })}</>}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-mut">{report.notes[0]}</p>
      {!report.calibrated && <p className="mt-1 text-[13px] font-semibold text-watch">{t("Outside the calibrated area: treat the money figures as rough.")}</p>}
    </Glass>
  );
}

function StatCell({ s, u, signed = false }: { s: Stat; u: UnitFormat; signed?: boolean }) {
  const f = signed ? signedPerArea : perArea;
  return (
    <td className="py-2 pl-2 text-right sm:pl-3">
      <span className="block text-[15px] font-extrabold sm:text-[16px]">{f(u, s.p50)}</span>
      <span className="block text-[12px] text-mut">{t("{a} to {b}", { a: f(u, s.p10), b: f(u, s.p90) })}</span>
    </td>
  );
}

function ClimateBillBlock({ bill, report, u }: { bill: ClimateBill; report: EconomicsReport; u: UnitFormat }) {
  const alt = bill.best_alternative;
  const tone = bill.change.p50 < 0 ? "text-alert" : bill.change.p50 > 0 ? "text-ok" : "";
  return (
    <Glass as="section" className="p-5" aria-labelledby="bill-h">
      <BlockHead id="bill-h" n={1} title={t("The climate bill")} kind="modelled" sub={<>{t("Your rotation")}: <span className="font-semibold text-tx">{bill.name}</span>{report.yours_assumed && ` (${t("assumed")})`}</>} />
      <p className="mb-3 max-w-[70ch] text-[15px] leading-normal">{bill.sentence}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[12px] text-mut">
              <th scope="col" className="pb-1 text-left font-semibold"><span className="sr-only">{t("Measure")}</span></th>
              <th scope="col" className="pb-1 pl-3 text-right font-semibold">{t("Today's climate")}</th>
              <th scope="col" className="pb-1 pl-3 text-right font-semibold">{t("Scenario")}</th>
              <th scope="col" className="pb-1 pl-3 text-right font-semibold">{t("Change")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <th scope="row" className="py-2 text-left font-semibold">{t("Margin a year")}<span className="block text-[12px] font-normal text-mut max-sm:hidden">{t("typical, and bad to good years")}</span></th>
              <StatCell s={bill.today} u={u} />
              <StatCell s={bill.scenario} u={u} />
              <td className="py-2 pl-2 text-right sm:pl-3">
                <span className={`block text-[15px] font-extrabold sm:text-[16px] ${tone}`}>{signedPerArea(u, bill.change.p50)}</span>
                <span className="block text-[12px] text-mut">{t("{a} to {b}", { a: signedPerArea(u, bill.change.p10), b: signedPerArea(u, bill.change.p90) })}</span>
              </td>
            </tr>
            <tr>
              <th scope="row" className="py-2 text-left font-semibold">{t("Whole field a year")}<span className="block text-[12px] font-normal text-mut">{u.area(report.area.value_ha)}</span></th>
              <td className="py-2 pl-3 text-right text-mut" colSpan={2}>{t("change only")}</td>
              <td className={`py-2 pl-3 text-right text-[16px] font-extrabold ${tone}`}>{dollars(bill.change_whole_field.p50, true)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <dl className="mt-3 grid gap-3 border-t border-line pt-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[12px] text-mut">
            {bill.other_heat_response === "local" ? t("If yields react to heat like this county's history") : t("If yields react to heat like US research finds")}
          </dt>
          <dd className="text-[16px] font-extrabold">{t("{v} a year", { v: signedPerArea(u, bill.other_heat_response_change_usd_ha) })}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-mut">{t("Best alternative in the scenario")}</dt>
          {alt ? (
            <dd>
              <span className="font-semibold">{alt.name}</span>{" "}
              <span className="text-mut">{t("{v} a year", { v: perArea(u, alt.scenario_margin.p50) })}</span>
              <span className="block text-[13px]">
                {alt.wins_back_usd_ha > 0
                  ? alt.wins_back_share !== null
                    ? t("earns {v} more than yours, {share} of what the climate costs", { v: perArea(u, alt.wins_back_usd_ha), share: pct(alt.wins_back_share) })
                    : t("earns {v} more than yours", { v: perArea(u, alt.wins_back_usd_ha) })
                  : t("earns less than yours")}
              </span>
            </dd>
          ) : <dd className="text-mut">{t("No other priced rotation to compare.")}</dd>}
        </div>
      </dl>
      <details className="mt-3 border-t border-line pt-2 text-[12px] leading-snug text-mut">
        <summary className="cursor-pointer py-1 font-semibold hover:text-tx">{t("Sources ({n})", { n: bill.sources.length })}</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4" role="list">{bill.sources.map((x) => <li key={x}>{x}</li>)}</ul>
      </details>
    </Glass>
  );
}

function BadYearsBlock({ rows, colorOf, u }: { rows: BadYears[]; colorOf: (id: string) => string; u: UnitFormat }) {
  const runs = rows[0]?.runs ?? 25;
  const line = (label: string, sub: string | null, cell: (b: BadYears) => ReactNode) => (
    <tr>
      <th scope="row" className="py-2 text-left font-semibold">{label}{sub && <span className="block text-[12px] font-normal text-mut">{sub}</span>}</th>
      {rows.map((b) => <td key={b.rotation_id} className="py-2 pl-3 text-right">{cell(b)}</td>)}
    </tr>
  );
  return (
    <Glass as="section" className="p-5" aria-labelledby="bad-h">
      <BlockHead id="bad-h" n={2} title={t("Bad-year money")} kind="modelled" sub={t("{n} replayed weather years, scenario climate", { n: runs })} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr>
              <th scope="col" className="pb-1"><span className="sr-only">{t("Measure")}</span></th>
              {rows.map((b) => (
                <th key={b.rotation_id} scope="col" className="pb-1 pl-3 text-right text-[13px] font-bold">
                  <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorOf(b.rotation_id) }} />{b.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {line(t("Seasons that lose money"), null, (b) => <span className="text-[16px] font-extrabold">{pct(b.losing_season_share)}</span>)}
            {line(t("Weather runs that lose money overall"), t("out of {n}", { n: runs }), (b) => <span className="font-bold">{b.losing_runs}</span>)}
            {line(t("Worst season"), t("per {unit}", { unit: u.moneyUnit.slice(1) }), (b) => <span className="font-bold">{perArea(u, b.worst_season_usd_ha)}</span>)}
            {line(t("Season margin"), t("bad (1 in 10) / typical / good (1 in 10)"), (b) => (
              <span className="text-[13px]">{perArea(u, b.season_margin.p10)} / <b>{perArea(u, b.season_margin.p50)}</b> / {perArea(u, b.season_margin.p90)}</span>
            ))}
            {line(t("Cash cushion"), t("to get through the worst run of seasons; typical run below"), (b) => (
              <span><b className="block">{perArea(u, b.cash_cushion_worst_usd_ha)}</b><span className="text-[12px] text-mut">{perArea(u, b.cash_cushion_typical_usd_ha)}</span></span>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[13px] leading-snug text-mut" role="list">
        {rows.map((b) => <li key={b.rotation_id}>{b.sentence}</li>)}
      </ul>
    </Glass>
  );
}

function GridBlock({ grid, rotations, colorOf, u }: { grid: WhoEarnsMost; rotations: RotationInput[]; colorOf: (id: string) => string; u: UnitFormat }) {
  const byId = new Map(rotations.map((r) => [r.id, r]));
  const priceLabel = (p: number) => (p === 0 ? t("today") : `${p > 0 ? "+" : MINUS}${Math.abs(p)}%`);
  return (
    <Glass as="section" className="p-5" aria-labelledby="grid-h">
      <BlockHead id="grid-h" n={3} title={t("Who earns most?")} kind="modelled"
        sub={t("Rows: warming. Columns: change in all crop prices. Rain: {v}% ({source}).", { v: grid.rain_change_pct.toFixed(0), source: grid.rain_change_source })} />
      <p className="mb-3 max-w-[70ch] text-[15px] leading-normal">{grid.sentence}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-1 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="text-left text-[12px] font-semibold text-mut">{t("Warming")}</th>
              {grid.price_change_pct.map((p) => <th key={p} scope="col" className="text-[12px] font-semibold text-mut">{priceLabel(p)}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.cells.map((row, ri) => (
              <tr key={ri}>
                <th scope="row" className="pr-1 text-left text-[12px] font-semibold text-mut">{u.tempDelta(grid.warming_c[ri], 0)}</th>
                {row.map((cell, ci) => {
                  const mine = grid.your_cell.row === ri && grid.your_cell.col === ci;
                  const w = cell.winner_rotation_id ? byId.get(cell.winner_rotation_id) : null;
                  const title = Object.entries(cell.margin_p50_usd_ha)
                    .map(([id, v]) => `${byId.get(id)?.name ?? id}: ${perArea(u, v)}`).join("\n");
                  return (
                    <td key={ci} title={title}
                      className={`h-11 rounded-chip px-1 text-center font-bold ${mine ? "outline outline-2 outline-offset-[-2px] outline-tx" : ""}`}
                      style={w ? { background: `color-mix(in srgb, ${colorOf(w.id)} 24%, transparent)` } : undefined}>
                      {w ? shortName(w) : <span className="font-semibold text-mut">{t("too close")}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" role="list">
        {rotations.map((r) => (
          <li key={r.id} className="inline-flex items-center gap-1.5">
            <i aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorOf(r.id) }} />
            <b>{shortName(r)}</b> <span className="text-mut">{r.name}</span>
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5 text-mut">
          <i aria-hidden className="h-2.5 w-2.5 rounded-[3px] outline outline-2 outline-tx" />
          {grid.your_cell.exact ? t("your scenario") : t("nearest to your scenario")}
        </li>
      </ul>
    </Glass>
  );
}

function InputsBlock({ report }: { report: EconomicsReport }) {
  return (
    <Glass as="section" className="p-5" aria-labelledby="inputs-h">
      <BlockHead id="inputs-h" n={4} title={t("The numbers used")} kind="scenario" sub={t("Defaults with their source, or “Your number” where you typed one.")} />
      <ul className="divide-y divide-line text-sm" role="list">
        {report.inputs_used.map((i) => (
          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
            <span className="font-semibold">{i.label}</span>
            <span className="text-right">
              <b>{i.display}</b>
              <span className={`block max-w-[52ch] text-[12px] leading-snug ${i.source === "Your number" ? "text-lime" : "text-mut"}`}>{i.source === "Your number" ? t("Your number") : i.source}</span>
            </span>
          </li>
        ))}
      </ul>
      {report.excluded_rotations.length > 0 && (
        <div className="mt-3 border-t border-line pt-3 text-[13px]">
          <p className="font-semibold">{t("Left out")}</p>
          <ul className="text-mut" role="list">{report.excluded_rotations.map((e) => <li key={e.rotation_id}>{e.rotation_id}: {e.reason}</li>)}</ul>
        </div>
      )}
      {report.assumptions.length > 0 && (
        <div className="mt-3 border-t border-line pt-3 text-[13px]">
          <p className="font-semibold">{t("Assumptions")}</p>
          <ul className="space-y-1.5" role="list">
            {report.assumptions.map((a) => (
              <li key={a.topic}><b>{a.topic}.</b> {a.text} <span className="text-mut">{a.source}</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 space-y-1 border-t border-line pt-3 text-[12px] leading-snug text-mut">
        {report.notes.slice(1).map((n) => <p key={n}>{n}</p>)}
        <p>{t("Simulator model {v} · {n} weather years, {a} to {b}", {
          v: report.simulator_model_version, n: report.ensemble_size,
          a: report.ensemble_start_years[0] ?? "", b: report.ensemble_start_years[report.ensemble_start_years.length - 1] ?? "",
        })}</p>
      </div>
    </Glass>
  );
}
