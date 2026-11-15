import { ArrowRight, ArrowUpRight } from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { cropdoctorApi } from "../../modules/cropdoctor/api/cropdoctorApi";
import type { FarmHealth, Indicator } from "../../modules/cropdoctor/types";
import { Button, KindTag } from "../../shared/components";
import { ndviStep } from "../../shared/charts/ndvi";
import { useMedia } from "../../shared/hooks/useMedia";
import type { Route } from "../route";
import { HeroMap, type HeroField } from "./HeroMap";
import { formatDate, t as tr } from "../../shared/i18n";
import { LanguageSwitch } from "../../shared/i18n/LanguageSwitch";

// three.js is large; load it after the page has painted.
const Globe = lazy(() => import("./Globe"));

const DEMO_FARM = "demo";
const DEMO_CENTER: [number, number] = [42.0394, -93.4583];

const day = (iso: string) =>
  formatDate(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const signed = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

/** Public front door: what AgroMind is, a live look at the demo farm, the data behind it and how honest it is. */
export function LandingPage({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const [health, setHealth] = useState<FarmHealth | null>(null);
  // Phones: almost no padding, so the three fields still fill the map.
  const narrow = useMedia("(max-width: 639px)");

  useEffect(() => {
    const ctl = new AbortController();
    cropdoctorApi.getHealth(DEMO_FARM, undefined, ctl.signal).then(setHealth).catch(() => setHealth(null));
    return () => ctl.abort();
  }, []);

  const fields: HeroField[] = (health?.fields ?? []).map((f) => {
    const v = f.greenness?.value.value;
    const tone = f.status === "alert" ? "alert" : f.status === "watch" ? "watch" : f.status === "normal" ? "ok" : undefined;
    return { id: f.id, name: f.name, boundary: f.boundary, step: v == null ? null : ndviStep(v), chip: v == null ? undefined : v.toFixed(2), tone };
  });
  const period = health?.fields.find((f) => f.greenness?.value.period_start)?.greenness?.value;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

  return (
    <div className="min-h-full">
      {/* Hero: text on the left, Earth turning in from the bottom-right corner. */}
      <section aria-labelledby="hero-h" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <Suspense fallback={null}>
          {/* A square centred near the bottom-right corner: a quarter to a third of the globe shows. */}
          <Globe
            className="pointer-events-none absolute z-0 aspect-square [--g:170vw] [--gx:.55] [--gy:.5] sm:[--g:120vw] sm:[--gx:.52] sm:[--gy:.52] lg:[--g:min(175vh,110vw)] lg:[--gx:.52] lg:[--gy:.54]"
            style={{ width: "var(--g)", left: "calc(100% - var(--gx) * var(--g))", top: "calc(100% - var(--gy) * var(--g))" }} />
        </Suspense>
        {/* The globe fades into the page instead of ending on a hard edge. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-28 bg-gradient-to-t from-ground to-transparent" />

        <header className="relative z-20 mx-auto flex h-[72px] w-full max-w-[1240px] items-center gap-6 px-5 lg:px-8">
          <Logo />
          <nav aria-label={tr("Page sections")} className="ml-auto hidden items-center gap-7 md:flex">
            {NAV.map(([id, label]) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="text-sm font-medium text-mut transition-colors hover:text-tx">{label}</button>
            ))}
          </nav>
          <LanguageSwitch className="ml-auto md:ml-0" />
          <Button className="whitespace-nowrap" onClick={() => onNavigate("overview")}>{tr("Open the app")}</Button>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-5 pb-[84vw] pt-10 sm:pb-[62vw] sm:pt-14 lg:justify-center lg:px-8 lg:pb-24 lg:pt-0">
          <div className="anim-in max-w-[720px]">
            <p className="text-[13px] font-medium text-mut">{tr("NASA Space Apps Challenge")} <span aria-hidden className="mx-1.5 text-mut/50">/</span> {tr("Field Shift")}</p>
            <h1 id="hero-h" className="mt-5 text-balance text-[clamp(2.25rem,9.4vw,4.25rem)] font-semibold leading-[1.04] tracking-[-.03em]">
              <span className="sm:whitespace-nowrap">{tr("Understand your farm")}</span><br /><span className="text-mut">{tr("Test its future")}</span>
            </h1>
            <p className="mt-6 max-w-[36rem] text-[18px] leading-[1.6] text-mut">
              {tr("AgroMind watches your fields from orbit with NASA satellites and weather records, tells you when one drifts from its own normal, and lets you test crop rotations against the climate your farm could face.")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button variant="primary" className="!px-6 !py-3.5 !text-[15px]" onClick={() => onNavigate("overview")}>
                {tr("Open your farm")} <ArrowRight size={16} strokeWidth={2} />
              </Button>
              <button type="button" onClick={() => scrollTo("demo")} className="text-[15px] font-medium text-tx underline decoration-line decoration-1 underline-offset-[6px] transition-colors hover:decoration-tx">
                {tr("See it on a real season")}
              </button>
            </div>
          </div>
        </div>
        <p className="absolute bottom-4 right-8 z-10 hidden text-[12px] text-mut lg:block">{tr("Earth imagery: NASA Blue Marble and Black Marble")}</p>
      </section>

      <main>
        {/* A real season on the demo farm: observed greenness and the finding the Command Center gives. */}
        <Section id="demo" title={tr("One real season, seen from orbit")}
          lede={tr("The demo farm in Story County, Iowa, on 12 August 2012, in the middle of the Corn Belt drought. Nothing here is mocked up: the colours and numbers come from the same data the app uses.")}>
          <figure className="mx-0 mt-0">
            <div className="relative isolate h-[300px] overflow-hidden rounded-panel border border-line sm:h-[400px] lg:h-[440px]">
              <HeroMap center={health?.farm.center ?? DEMO_CENTER} fields={fields} padTopLeft={narrow ? [8, 8] : [28, 28]} padBottomRight={narrow ? [8, 8] : [28, 28]} />
              {!health && <p className="absolute inset-0 z-10 grid place-items-center text-[13px] text-mut">{tr("Loading the demo farm…")}</p>}
            </div>
            <figcaption className="mt-3 text-[13px] leading-5 text-mut">
              {tr("Fields coloured by greenness (NDVI)")}{period?.period_start && period.period_end ? tr(", MODIS, {day} to {day2}", { day: day(period.period_start), day2: day(period.period_end) }) : ""}<span aria-hidden className="mx-1.5 text-mut/50">·</span>{tr("Imagery © Esri")}
            </figcaption>
          </figure>
          {health?.findings[0] && <Finding health={health} />}
        </Section>

        <Section id="tools" title={tr("Three tools, one farm")} lede={tr("Each answers one question a farmer asks. They share the same fields, soil and weather, so what you set up once is used everywhere.")}>
          <ul className="border-t border-line">
            {TOOLS.map((t) => (
              <li key={t.route} className="grid gap-x-8 gap-y-2 border-b border-line py-7 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_auto] md:items-start">
                <div>
                  <p className="text-[13px] text-mut">{t.name}</p>
                  <h3 className="mt-1 text-[22px] font-medium leading-snug tracking-[-.01em]">{tr(t.question)}</h3>
                </div>
                <p className="text-[15px] leading-[1.6] text-mut">{tr(t.text)}</p>
                <button type="button" onClick={() => onNavigate(t.route)} aria-label={tr("Open {name}", { name: t.name })}
                  className="mt-2 inline-flex w-fit items-center gap-1.5 text-[15px] font-medium text-tx transition-colors hover:text-lime md:mt-1">
                  {tr("Open")} <ArrowUpRight size={16} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="data" title={tr("Built on open Earth observations")} lede={tr("Every number traces back to a public dataset. These are the ones AgroMind uses today.")}>
          <ul className="border-t border-line">
            {SOURCES.map((s) => (
              <li key={s.name} className="grid gap-x-8 gap-y-1 border-b border-line py-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-baseline">
                <p className="text-[15px] font-medium">
                  {s.name}
                  {s.nasa && <span className="ml-2 text-[12px] font-normal text-mut">{tr("NASA")}</span>}
                </p>
                <p className="text-[14px] leading-6 text-mut">{s.use}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="honesty" title={tr("Every number says where it came from")} lede={tr("A farm decision is only as good as the data behind it, so AgroMind labels every value and never dresses a guess up as a measurement.")}>
          <dl className="border-t border-line">
            {KINDS.map((k) => (
              <div key={k.kind} className="grid gap-x-8 gap-y-2 border-b border-line py-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-baseline">
                <dt><KindTag kind={k.kind} /></dt>
                <dd className="text-[15px] leading-[1.6] text-mut">{tr(k.text)}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {RULES.map((r) => <li key={r} className="border-l border-line pl-4 text-[14px] leading-6 text-mut">{r}</li>)}
          </ul>
        </Section>

        <section aria-labelledby="cta-h" className="mx-auto max-w-[1240px] px-5 pb-24 pt-8 lg:px-8">
          <div className="border-t border-line pt-16 text-center">
            <h2 id="cta-h" className="mx-auto max-w-[18ch] text-balance text-[clamp(2rem,6vw,3.25rem)] font-medium leading-[1.08] tracking-[-.025em]">{tr("Start with the demo farm")}</h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] leading-[1.6] text-mut">
              {tr("Spot the stressed field in the 2012 drought, then test which rotation holds up if summers like that become normal.")}
            </p>
            <Button variant="primary" className="mt-8 !px-6 !py-3.5 !text-[15px]" onClick={() => onNavigate("overview")}>
              {tr("Open your farm")} <ArrowRight size={16} strokeWidth={2} />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1240px] gap-4 px-5 py-10 text-[13px] leading-relaxed text-mut md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-8 lg:px-8">
          <Logo />
          <p>
            {tr("Built for the NASA Space Apps Challenge. Not an official NASA product and not endorsed by NASA. Satellite imagery © Esri. Globe: NASA Blue Marble Next Generation and VIIRS Black Marble via NASA GIBS. Weather, greenness and climate projections from NASA open data; soil from ISRIC SoilGrids.")}
          </p>
        </div>
      </footer>
    </div>
  );
}

const NAV = [["demo", tr("Demo")], ["tools", tr("Tools")], ["data", tr("Data")], ["honesty", tr("Honesty")]] as const;

const TOOLS: { route: Route; name: string; question: string; text: string }[] = [
  { route: "farm-profile", name: tr("Farm profile"), question: tr("What is my farm?"),
    text: tr("Find your farm on the satellite map and trace each field. Soil comes from SoilGrids; you add crops, history and what matters most to you.") },
  { route: "command-center", name: tr("Command Center"), question: tr("How are my fields doing?"),
    text: tr("Satellite greenness, rain and heat, each against the field's own 10-year normal. When a field drifts you get a cautious explanation and a check to do on foot.") },
  { route: "simulator", name: tr("Simulator"), question: tr("What should I plant next?"),
    text: tr("Compare crop rotations over 25 years of real weather, in today's climate or under NASA climate-model projections for the 2050s and 2080s.") },
];

const SOURCES: { name: string; nasa: boolean; use: string }[] = [
  { name: tr("NASA POWER daily (MERRA-2)"), nasa: true, use: tr("Daily rain, temperature, sun and wind since 2001, and crop water demand (FAO-56).") },
  { name: tr("MODIS MOD13Q1 / MYD13Q1 v6.1"), nasa: true, use: tr("Greenness (NDVI) every 16 days at 250 m, compared with each field's 10-year normal.") },
  { name: tr("NASA NEX-GDDP-CMIP6"), nasa: true, use: tr("Downscaled climate projections: 6 models, two emissions paths, 2050s and 2080s.") },
  { name: tr("ISRIC SoilGrids v2.0"), nasa: false, use: tr("Soil texture, turned into how much water the root zone can hold.") },
  { name: tr("USDA Cropland Data Layer"), nasa: false, use: tr("What was planted on each field, year by year.") },
  { name: tr("USDA NASS county yields"), nasa: false, use: tr("Story County yields 2001–2025, used to calibrate the crop model.") },
  { name: tr("ISU budgets and USDA WASDE"), nasa: false, use: tr("2026 production costs and farm prices for the optional margin estimate.") },
];

const KINDS = [
  { kind: "observed" as const, text: tr("Measured by a satellite or weather record, with its source and date.") },
  { kind: "modelled" as const, text: tr("Estimated by a model, like crop water use or yield. Its assumptions are listed next to it.") },
  { kind: "scenario" as const, text: tr("Something you chose to test, like +2 °C. A what-if, never a forecast.") },
];

const RULES = [
  tr("Findings say “may be”, never “detected”, and always come with a check to do in the field."),
  tr("Satellites can't see pests or disease, and every finding says so."),
  tr("The crop model is calibrated to county yields and leads with change against today's climate, not a promised harvest."),
  tr("Any value without a published source is marked as an assumption where you can see it."),
];

/** A page section: title and lede in a left column on wide screens, content on the right. */
function Section({ id, title, lede, children }: { id: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mx-auto max-w-[1240px] scroll-mt-8 px-5 py-14 sm:py-20 lg:px-8">
      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <h2 id={`${id}-h`} className="text-balance text-[clamp(1.75rem,5.4vw,2.25rem)] font-medium leading-[1.12] tracking-[-.02em]">{title}</h2>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.6] text-mut">{lede}</p>
        </div>
        <div className="min-w-0 space-y-8">{children}</div>
      </div>
    </section>
  );
}

function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2 text-[18px] font-semibold text-tx">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 21c0-7 3-12 9-15-1 8-4 13-9 15Z" fill="var(--color-lime)" />
        <path d="M12 21C12 15 9.5 10.5 3 8c.6 7 3.6 11.4 9 13Z" fill="var(--color-rain)" />
      </svg>
      {tr("AgroMind")}
    </a>
  );
}

/** The live finding from the demo farm's replay, straight from the CropDoctor API, set as plain text and a table. */
function Finding({ health }: { health: FarmHealth }) {
  const f = health.findings[0];
  return (
    <section aria-label={tr("Example finding from the demo farm")} className="grid gap-x-10 gap-y-6 md:grid-cols-2">
      <div>
        <p className="text-[13px] font-medium text-watch">
          {f.severity === "alert" ? tr("Alert") : tr("Watch")} <span aria-hidden className="mx-1 text-mut/50">/</span>
          <span className="text-mut"> {tr("{field_name}, since {day}", { field_name: f.field_name, day: day(f.since) })}</span>
        </p>
        <h3 className="mt-2 text-[24px] font-medium leading-snug tracking-[-.01em]">{f.headline}</h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-mut">{f.summary} {f.explanations[0]?.text}</p>
        {f.explanations[0] && (
          <p className="mt-3 border-l-2 border-watch-fill pl-4 text-[15px] leading-[1.6]">
            <span className="font-medium">{tr("Suggested check")}</span><span aria-hidden className="mx-1.5 text-mut/50">·</span> {f.explanations[0].check}
          </p>
        )}
        <p className="mt-3 text-[13px] text-mut">{f.caveat}</p>
      </div>
      <table className="h-fit w-full text-[14px] tabular-nums">
        <caption className="pb-2 text-left text-[13px] font-medium text-mut">
          {health.is_replay ? tr("Replay of {day}", { day: day(health.as_of) }) : tr("As of {day}", { day: day(health.as_of) })}{tr(", against the 10-year normal")}
        </caption>
        <tbody>
          {f.evidence.map((e) => <Evidence key={e.id} e={e} />)}
        </tbody>
      </table>
    </section>
  );
}

function Evidence({ e }: { e: Indicator }) {
  const v = e.value;
  if (v.value === null) return null;
  const val = v.unit === "" ? v.value.toFixed(2) : `${v.value.toFixed(v.unit === "mm" ? 0 : 1)} ${v.unit}`;
  const diff = v.diff === null ? null : `${signed(v.diff, v.diff_unit === "°C" ? 1 : 0)}${v.diff_unit === "%" ? "%" : ` ${v.diff_unit}`}`;
  const hue = e.id === "greenness" ? "bg-ndvi-3" : e.id === "rain_30d" ? "bg-rain" : e.id === "tmax_30d" ? "bg-heat" : "bg-water";
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-3 pr-3 text-left font-medium" title={v.source}>
        <i aria-hidden className={`mr-2.5 inline-block h-2 w-2 rounded-full align-middle ${hue}`} />{tr(e.label)}
      </th>
      <td className="whitespace-nowrap py-3 text-right font-medium">{val}</td>
      <td className="w-20 whitespace-nowrap py-3 text-right text-[13px] text-mut">{diff ?? ""}</td>
    </tr>
  );
}
