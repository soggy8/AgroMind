import {
  AlertTriangle, ArrowRight, CheckCircle2, Circle, Compass, FlaskConical, MapPinned, ScanSearch, Sparkles,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { fmtDate, fmtDiff, fmtValue } from "../../modules/cropdoctor/lib/format";
import type { FarmHealth } from "../../modules/cropdoctor/types";
import type { FarmOut } from "../../modules/croptwin/types";
import type { SavedRunSummary } from "../../modules/simulator/types";
import { NDVI_BG, ndviStep } from "../../shared/charts/ndvi";
import { AssistantChat } from "../../shared/assistant";
import { Button, Glass, KindTag, Skeleton, StatusPill, Tour, tourSeen, type TourStep } from "../../shared/components";
import { useMedia } from "../../shared/hooks/useMedia";
import { FarmMap, type MapField } from "../../shared/map/FarmMap";
import { type ImageryCapture, imageryCredit, ImageryDateWatcher } from "../../shared/map/ImageryDate";
import { useUnits } from "../../shared/units";
import { DEMO_FARM } from "../farm";
import type { AppRoute, Route } from "../route";
import { TopBar } from "../TopBar";
import { nextStep, setupChecks } from "./nextStep";
import { type Part, useOverview } from "./useOverview";
import { formatDate, t as tr, tn as trn } from "../../shared/i18n";

const TOUR_ID = "overview-v1";
const TOUR: TourStep[] = [
  { target: "ov-next", title: tr("Start here"), body: tr("AgroMind reads your farm, its fields' health and your plans, and suggests the one thing worth doing next.") },
  { target: "ov-map", title: tr("Your farm from orbit"), body: tr("Each field coloured by its satellite greenness. Zoom out to see the whole Earth; zoom in to see your fields.") },
  { target: "ov-ask", title: tr("Just ask"), body: tr("Type what you want in your own words: \"show me March 2016\", \"what if it's 2 °C hotter?\". AgroMind opens the right tool, changes the settings while you watch and explains the result.") },
  { target: "ov-steps", title: tr("Three tools, in order"), body: tr("Set up your farm, watch how each field is doing, then plan which crops to grow next. Each card shows what is inside before you open it.") },
  { target: "advisor", title: tr("Ask anytime"), body: tr("The advisor explains what AgroMind shows and can take you to the right place.") },
];

const ZERO_INSETS = { left: 0, right: 0, top: 0, bottom: 0 };
const toneText = { watch: "text-watch", alert: "text-alert", normal: "text-ok" } as const;

/**
 * The Overview: the app's front door. One recommended next step, the farm on the map, and the three tools as doors
 * in the order a farmer uses them (set up, watch, plan), each with a live summary of what is inside.
 */
export function OverviewPage({ farmId, route, onNavigate }: { farmId: string; route: Route; onNavigate: (r: Route) => void }) {
  const o = useOverview(farmId);
  const u = useUnits();
  const desktop = useMedia("(min-width: 1024px)");
  const [imagery, setImagery] = useState<ImageryCapture | "error" | null>(null);
  const [touring, setTouring] = useState(false);
  const endTour = useCallback(() => setTouring(false), []);

  const farm = o.farm.data;
  const health = o.health.data;
  const runs = o.runs.data;
  const n = health?.findings.length ?? 0;
  const step = nextStep(farm, health, runs);
  const go = (r: AppRoute) => onNavigate(r);

  useEffect(() => {
    if ((farm || health) && desktop && !tourSeen(TOUR_ID)) {
      const t = setTimeout(() => setTouring(true), 600);
      return () => clearTimeout(t);
    }
  }, [farm, health, desktop]);

  const name = farm?.name ?? health?.farm.name ?? tr("Your farm");
  const region = farm?.region ?? health?.farm.region ?? null;
  const fieldCount = farm?.fields.length ?? health?.fields.length ?? null;
  const area = farm ? farm.fields.reduce((s, f) => s + f.area_ha, 0) : health?.fields.reduce((s, f) => s + f.area_ha, 0) ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <TopBar route={route} onNavigate={onNavigate}
        status={n > 0 && <StatusPill tone="watch">{trn(n, "1 finding", "{n} findings")}</StatusPill>}
        onHelp={() => setTouring(true)} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-10 pt-6 lg:px-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-4">
            <header className="anim-in px-1">
              <p className="text-[12.5px] font-bold uppercase tracking-[.08em] text-lime">{tr("Overview")}</p>
              <h1 className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-.02em] sm:text-[38px]">{name}</h1>
              <p className="mt-1 text-[15px] text-mut">
                {[region, fieldCount !== null && trn(fieldCount, "{n} field", "{n} fields"), area ? u.area(area) : null].filter(Boolean).join(" · ")}
              </p>
              {farmId === DEMO_FARM && (
                <p className="mt-2 text-[13px] leading-snug text-mut">{tr("Demo farm with sample data: illustrative fields with real NASA weather and satellite data.")}</p>
              )}
            </header>
            <NextStepCard step={step} loading={o.farm.loading && o.health.loading} onGo={go} />
          </div>

          <section aria-label={tr("Farm map")} data-tour="ov-map"
            className="relative isolate h-[320px] overflow-hidden rounded-panel border border-line sm:h-[380px] lg:h-auto lg:min-h-[420px]">
            {health && (health.farm.center ?? health.fields[0]?.boundary[0]) ? (
              <>
                <FarmMap fields={mapFields(health)} center={(health.farm.center ?? health.fields[0].boundary[0])!} insets={ZERO_INSETS}
                  startOnGlobe={farmId === DEMO_FARM} globeLabel={health.farm.name}>
                  <ImageryDateWatcher onChange={setImagery} />
                </FarmMap>
                <p className="glass absolute bottom-2 left-2 z-[500] max-w-[calc(100%-16px)] !rounded-[10px] px-[11px] py-[6px] text-[12px] leading-snug">
                  {greennessLine(health)}{imageryCredit(imagery)}
                </p>
              </>
            ) : o.health.loading ? <Skeleton className="h-full w-full" /> : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-mut">
                {o.health.error ? tr("Couldn't load the map: {error}", { error: o.health.error }) : tr("No fields to show yet.")}
              </div>
            )}
          </section>
        </div>

        <div className="mt-6"><AssistantChat farmName={farm?.name ?? health?.farm.name} /></div>

        <section aria-labelledby="steps-h" className="mt-10" data-tour="ov-steps">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 id="steps-h" className="text-[21px] font-bold tracking-[-.01em]">{tr("Your three tools")}</h2>
            <p className="text-[13px] text-mut">{tr("Set up your farm, watch it, then plan what to grow.")}</p>
          </div>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            <StepCard n={1} icon={MapPinned} name={tr("Farm profile")} question={tr("Is my farm set up?")} action={tr("Open farm profile")} onOpen={() => go("farm-profile")}>
              <PartView part={o.farm}>{(f) => <SetupSummary farm={f} />}</PartView>
            </StepCard>
            <StepCard n={2} icon={ScanSearch} name={tr("Command Center")} question={tr("How are my fields doing?")} action={tr("Open Command Center")} onOpen={() => go("command-center")}>
              <PartView part={o.health}>{(h) => <HealthSummary health={h} />}</PartView>
            </StepCard>
            <StepCard n={3} icon={FlaskConical} name={tr("Simulator")} question={tr("What should I plant next?")} action={tr("Open the Simulator")} onOpen={() => go("simulator")}>
              <PartView part={o.runs}>{(r) => <RunsSummary runs={r} />}</PartView>
            </StepCard>
          </ol>
        </section>
      </main>
      {touring && <Tour id={TOUR_ID} steps={TOUR} onClose={endTour} />}
    </div>
  );
}

function mapFields(h: FarmHealth): MapField[] {
  return h.fields.map((f) => {
    const v = f.greenness?.value;
    return {
      id: f.id, name: f.name, boundary: f.boundary,
      chip: v?.value != null ? fmtValue(v) : undefined,
      ndviStep: v?.value != null ? ndviStep(v.value) : null,
      tone: f.status === "watch" || f.status === "alert" ? f.status : f.status === "normal" ? "ok" : undefined,
    };
  });
}

function greennessLine(h: FarmHealth): string {
  const g = h.fields.find((f) => f.greenness?.value.period_start)?.greenness?.value;
  return g?.period_start && g.period_end ? tr("Greenness: MODIS, {fmtDate} to {fmtDate2} · ", { fmtDate: fmtDate(g.period_start), fmtDate2: fmtDate(g.period_end) }) : "";
}

function NextStepCard({ step, loading, onGo }: { step: ReturnType<typeof nextStep>; loading: boolean; onGo: (r: AppRoute) => void }) {
  if (!step) {
    return (
      <Glass className="p-5" aria-busy={loading || undefined}>
        {loading ? <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
          : <p className="text-sm text-mut">{tr("Couldn't work out a next step: the farm's data didn't load. Open any tool below.")}</p>}
      </Glass>
    );
  }
  const wash = step.tone === "watch" ? { background: "linear-gradient(170deg, rgb(255 162 58 / .26), rgb(255 90 78 / .10) 55%, transparent)" } : undefined;
  const Icon = step.tone === "watch" ? AlertTriangle : step.tone === "ok" ? CheckCircle2 : Compass;
  return (
    <Glass as="section" aria-labelledby="next-h" data-tour="ov-next" className="anim-in overflow-hidden">
      <div className="p-5 sm:p-6" style={wash}>
        <p className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-mut">
          <Sparkles size={14} strokeWidth={1.75} className="text-lime" /> {tr("Next step")}
        </p>
        <h2 id="next-h" className="mt-2 flex items-start gap-2 text-[21px] font-bold leading-snug tracking-[-.01em]">
          <Icon size={22} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${step.tone === "watch" ? "text-watch" : step.tone === "ok" ? "text-ok" : "text-lime"}`} />
          <span>{tr(step.title)}</span>
        </h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-mut">{tr(step.body)}</p>
        <Button variant="primary" className="mt-4 !px-5 !py-3 !text-[15px]" onClick={() => onGo(step.route)}>
          {tr(step.action)} <ArrowRight size={16} strokeWidth={2} />
        </Button>
      </div>
    </Glass>
  );
}

function StepCard({ n, icon: Icon, name, question, action, onOpen, children }: {
  n: number; icon: typeof MapPinned; name: string; question: string; action: string; onOpen: () => void; children: ReactNode;
}) {
  return (
    <li className="glass flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ctl border border-line bg-glass-hi">
          <Icon size={19} strokeWidth={1.75} className="text-lime" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-mut">{tr("Step {n} · {name}", { n, name })}</p>
          <h3 className="text-[18px] font-bold leading-snug tracking-[-.01em]">{question}</h3>
        </div>
      </div>
      <div className="mt-4 flex-1 border-t border-line pt-4">{children}</div>
      <Button className="mt-5 w-full !py-2.5" onClick={onOpen}>
        {action} <ArrowRight size={15} strokeWidth={1.75} />
      </Button>
    </li>
  );
}

function PartView<T>({ part, children }: { part: Part<T>; children: (data: T) => ReactNode }) {
  if (part.data) return <>{children(part.data)}</>;
  if (part.loading) return <div className="space-y-2" aria-busy="true"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>;
  return <p role="alert" className="text-[13px] leading-snug text-alert">{tr("Couldn't load this: {error}", { error: part.error })}</p>;
}

function SetupSummary({ farm }: { farm: FarmOut }) {
  const checks = setupChecks(farm);
  const done = checks.filter((c) => c.done).length;
  return (
    <div>
      <p className="text-[13px] text-mut">{done === checks.length ? tr("Everything the tools use is filled in.") : tr("{done} of {length} filled in", { done, length: checks.length })}</p>
      <ul className="mt-2 space-y-1.5">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-sm">
            {c.done ? <CheckCircle2 size={16} strokeWidth={1.75} className="shrink-0 text-ok" aria-hidden /> : <Circle size={16} strokeWidth={1.75} className="shrink-0 text-mut" aria-hidden />}
            <span className="flex-1 font-semibold">{tr(c.label)}<span className="sr-only">{c.done ? tr(": done") : tr(": to do")}</span></span>
            <span className="text-[13px] text-mut">{tr(c.detail)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HealthSummary({ health }: { health: FarmHealth }) {
  const u = useUnits();
  const f = health.findings[0];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-mut">{health.is_replay ? tr("Replay · {fmtDate}", { fmtDate: fmtDate(health.as_of) }) : tr("As of {fmtDate}", { fmtDate: fmtDate(health.as_of) })}</p>
        <KindTag kind="observed" />
      </div>
      {f ? (
        <p className="mt-2 text-sm font-semibold text-watch">{f.field_name}: {f.headline.toLowerCase()}</p>
      ) : (
        <p className="mt-2 text-sm font-semibold text-ok">{tr("Every field is within its normal range.")}</p>
      )}
      <ul className="mt-2 space-y-1.5">
        {health.fields.map((fl) => {
          const v = fl.greenness?.value;
          return (
            <li key={fl.id} className="flex items-center gap-2 text-sm">
              <i aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${v?.value != null ? NDVI_BG[ndviStep(v.value)] : "bg-white/[.08]"}`} />
              <span className="flex-1 truncate font-semibold">{fl.name}</span>
              <span className="font-extrabold">{v ? fmtValue(v, u) : "–"}</span>
              <span className={`w-12 text-right text-[12px] font-bold ${toneText[fl.status as keyof typeof toneText] ?? "text-mut"}`}>{v ? fmtDiff(v) ?? "" : ""}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-mut">{tr("Greenness (NDVI) and change against each field's 10-year normal.")}</p>
    </div>
  );
}

function RunsSummary({ runs }: { runs: SavedRunSummary[] }) {
  const last = runs[0];
  if (!last) {
    return (
      <div>
        <p className="text-sm font-semibold">{tr("No saved runs yet.")}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-mut">
          {tr("Pick a field and up to four rotations, choose today's climate or a NASA projection, and see which holds up over 25 years of real weather.")}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[13px] text-mut">{trn(runs.length, "{n} saved run", "{n} saved runs")} {tr("· last {date}", { date: formatDate(new Date(last.created_at), { day: "numeric", month: "short", year: "numeric" }) })}</p>
      <p className="mt-2 truncate text-sm font-semibold" title={last.name}>{last.name}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm">
        <KindTag kind="modelled" /> <span className="text-mut">{tr("Ranked first:")}</span> <span className="truncate font-semibold">{last.recommended_rotation}</span>
      </p>
      <p className="mt-1 text-[13px] text-mut">{trn(last.rotation_names.length, "Compared {n} rotation.", "Compared {n} rotations.")}</p>
    </div>
  );
}
