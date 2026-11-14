import { PauseCircle, CircleCheck, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { SeasonChart, type SeasonChartPoint } from "../../../shared/charts/SeasonChart";
import { KindTag } from "../../../shared/components";
import { dayOfYear, fmtDate, fmtDayMonth, fmtMonth } from "../lib/format";
import type { FarmHealth, FieldHealth, Finding } from "../types";
import { growingSeason } from "./FieldsPanel";
import { FindingBlock } from "./FindingBlock";
import { HowWorkedOut } from "./HowWorkedOut";

const PAUSED = "Stress checks are paused";

/** The API's note without a leading "Stress checks are paused: ", which the heading already says. */
function pausedNote(note: string | null): string | null {
  if (!note) return null;
  if (!note.startsWith(`${PAUSED}:`)) return note;
  const rest = note.slice(PAUSED.length + 1).trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function StateBlock({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: string; children?: ReactNode }) {
  return (
    <section aria-label="Field state" className="border-b border-line pb-4">
      <h2 className={`flex items-start gap-2 text-[21px] font-bold leading-tight tracking-[-.01em] ${tone}`}>{icon}{title}</h2>
      {children}
    </section>
  );
}

function Top({ health, field, finding, onSelect }: { health: FarmHealth; field: FieldHealth; finding: Finding | undefined; onSelect: (id: string) => void }) {
  if (finding) return <FindingBlock finding={finding} />;
  const icon = (I: typeof CircleCheck) => <I size={20} strokeWidth={1.75} aria-hidden className="mt-[3px] shrink-0" />;
  if (field.status === "paused") {
    return (
      <StateBlock icon={icon(PauseCircle)} title={PAUSED} tone="text-tx">
        <p className="mt-2 text-sm leading-normal">{field.name}: {pausedNote(field.status_note)}</p>
      </StateBlock>
    );
  }
  if (field.status === "no_data") {
    return (
      <StateBlock icon={icon(CircleHelp)} title="No comparison for this date" tone="text-tx">
        <p className="mt-2 text-sm leading-normal">{field.name}: {field.status_note}</p>
      </StateBlock>
    );
  }
  const others = health.findings.filter((f) => f.field_id !== field.id);
  if (others.length === 0 && !health.fields.some((f) => f.status === "paused")) {
    return (
      <StateBlock icon={icon(CircleCheck)} title="All fields within normal range" tone="text-ok">
        <p className="mt-2 text-sm leading-normal">No field shows a run of low greenness periods on {fmtDate(health.as_of)}.</p>
      </StateBlock>
    );
  }
  return (
    <StateBlock icon={icon(CircleCheck)} title={`${field.name} is within its normal range`} tone="text-ok">
      {others.map((f) => (
        <p key={f.field_id} className="mt-2 text-sm leading-normal">
          {f.field_name} has a finding: {f.headline.toLowerCase()}.{" "}
          <button type="button" onClick={() => onSelect(f.field_id)} className="font-semibold text-lime underline-offset-2 hover:underline">
            Show {f.field_name}
          </button>
        </p>
      ))}
    </StateBlock>
  );
}

function SeasonSection({ field, finding }: { field: FieldHealth; finding: Finding | undefined }) {
  const season = growingSeason(field);
  const y = field.season_year;
  const points: SeasonChartPoint[] = season.map((p) => ({
    x: p.doy,
    label: fmtDayMonth(p.start),
    thisYear: p.this_year,
    lastYear: p.last_year,
    twoYearsAgo: p.two_years_ago,
    normal: p.normal,
    band: p.normal_low !== null && p.normal_high !== null ? [p.normal_low, p.normal_high] : null,
  }));
  const ticks = season.flatMap((p, i) =>
    i === 0 || fmtMonth(p.start) !== fmtMonth(season[i - 1].start) ? [{ x: p.doy, label: fmtMonth(p.start) }] : []);
  return (
    <section aria-labelledby="cd-season-h">
      <div className="flex items-center justify-between">
        <h3 id="cd-season-h" className="text-[15px] font-bold">Greenness this season</h3>
        <KindTag kind="observed" />
      </div>
      <p className="mt-0.5 text-[12px] text-mut">{field.name} · NDVI, 16-day periods from 1 Apr · MODIS</p>
      {points.length > 0 ? (
        <SeasonChart points={points} years={[String(y), String(y - 1), String(y - 2)]} ticks={ticks} normalLabel="10-yr normal"
          marker={finding ? { x: dayOfYear(finding.since), label: `Decline from ${fmtDayMonth(finding.since)}` } : undefined}
          ariaLabel={`Greenness of ${field.name} in ${y}, against ${y - 1}, ${y - 2} and the normal of the previous 10 years`} />
      ) : (
        <p className="mt-2 text-[13px] text-mut">No greenness readings for this field.</p>
      )}
    </section>
  );
}

/** Right panel: the finding or the field's state, the season chart, the data note and the method. */
export function StatusPanel({ health, field, onSelect }: { health: FarmHealth; field: FieldHealth | null; onSelect: (id: string) => void }) {
  const finding = field ? health.findings.find((f) => f.field_id === field.id) : undefined;
  const pastData = health.data_through && health.as_of > health.data_through;
  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-[18px]">
      {field && <Top health={health} field={field} finding={finding} onSelect={onSelect} />}
      {field && <SeasonSection field={field} finding={finding} />}
      <p className="text-[12px] leading-[1.45] text-mut">
        {health.data_note}
        {pastData && ` Saved data runs to ${fmtDate(health.data_through!)}.`}
      </p>
      <div className="border-t border-line pt-4">
        <HowWorkedOut assumptions={health.assumptions} sources={health.sources} />
      </div>
    </div>
  );
}
