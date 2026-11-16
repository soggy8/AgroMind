import { diffStep, ndviStep, type NdviStep } from "../../../shared/charts/ndvi";
import { WeeklyStrip } from "../../../shared/charts/WeeklyStrip";
import { FieldRow, IndicatorRow, KindTag } from "../../../shared/components";
import { type Units, useUnits } from "../../../shared/units";
import { fmtArea, fmtDate, fmtDayMonth, fmtDiff, fmtMonth, fmtTexture, fmtValue, ratio, shortSource, signed } from "../lib/format";
import type { FarmHealth, FieldHealth, Indicator, SeasonPoint, Status } from "../types";
import { t, tn } from "../../../shared/i18n";

const HUE = { greenness: "lime", rain_30d: "rain", tmax_30d: "heat", et0_30d: "water" } as const;

export const statusTone = (s: Status): "watch" | "alert" | "ok" | undefined =>
  s === "watch" || s === "alert" ? s : s === "normal" ? "ok" : undefined;

/** Periods starting 1 April to 31 October of the season year. */
export function growingSeason(f: FieldHealth): SeasonPoint[] {
  const y = f.season_year;
  return f.season.filter((p) => p.start >= `${y}-04-01` && p.start <= `${y}-10-31`);
}

/** "Corn (2012 crop map) · 23.9 ha": the crop label is the USDA crop map for the season shown, so it says which year. */
export function cropMeta(f: FieldHealth, u?: Units): string {
  return `${f.crop ? `${f.crop.label}${f.crop.year ? t(" ({year} crop map)", { year: f.crop.year }) : ""} · ` : ""}${fmtArea(f.area_ha, u)}`;
}

function valueTitle(ind: Indicator, u: Units): string {
  const v = ind.value;
  const parts = [v.source];
  if (v.period_start && v.period_end) parts.push(`${fmtDate(v.period_start)} to ${fmtDate(v.period_end)}`);
  if (v.normal !== null) parts.push(t("normal {fmtValue} from {normal_years} earlier years", { fmtValue: fmtValue({ ...v, value: v.normal }, u), normal_years: v.normal_years }));
  return parts.join(" · ");
}

function IndicatorFor({ ind, tone }: { ind: Indicator; tone?: "watch" | "alert" | "ok" }) {
  const u = useUnits();
  return (
    <IndicatorRow hue={HUE[ind.id]} name={ind.label} kind={ind.value.kind} source={shortSource(ind.value.source)}
      value={fmtValue(ind.value, u)} delta={fmtDiff(ind.value, false, u)} ratio={ratio(ind.value)} tone={tone} title={valueTitle(ind, u)} />
  );
}

function stripSegment(p: SeasonPoint): { key: string; step: NdviStep | null; title: string } {
  const when = t("Period from {fmtDayMonth}", { fmtDayMonth: fmtDayMonth(p.start) });
  if (p.this_year === null) return { key: p.start, step: null, title: t("{when}: no reading yet", { when }) };
  if (p.diff_pct === null) return { key: p.start, step: null, title: t("{when}: no comparison with a normal", { when }) };
  return { key: p.start, step: diffStep(p.diff_pct), title: t("{when}: {signed}% vs normal", { when, signed: signed(p.diff_pct) }) };
}

function FieldDetail({ health, field }: { health: FarmHealth; field: FieldHealth }) {
  const season = growingSeason(field);
  const ticks = season.flatMap((p, i) =>
    i === 0 || fmtMonth(p.start) !== fmtMonth(season[i - 1].start) ? [{ index: i, label: fmtMonth(p.start) }] : []);
  const soil = field.soil;
  const showNote = field.status_note && (field.status === "normal" || field.status === "watch" || field.status === "alert");
  return (
    <div className="mx-5 mb-2 mt-1">
      {!health.greenness_available && (
        <p className="border-b border-line py-2.5 text-[13px] leading-normal text-mut">{t("Greenness isn't available for this farm yet.")}</p>
      )}
      {field.greenness && <IndicatorFor ind={field.greenness} tone={statusTone(field.status)} />}
      {showNote && <p className="-mt-1 border-b border-line pb-2.5 pl-4 text-[12px] font-medium text-watch">{field.status_note}</p>}
      {season.length > 0 && (
        <div className="border-b border-line py-3">
          <WeeklyStrip label={t("Greenness vs normal, 8-day steps")} range={t("Apr to Oct {year}", { year: field.season_year })}
            segments={season.map(stripSegment)} ticks={ticks} />
        </div>
      )}
      {health.weather.map((w) => <IndicatorFor key={w.id} ind={w} />)}
      {(soil.texture || soil.ph !== null) && (
        <IndicatorRow hue="soil" name={soil.depth ? t("Soil, {depth}", { depth: soil.depth }) : t("Soil")} kind={soil.kind}
          source={soil.source ? shortSource(soil.source) : t("Farm profile")} title={soil.source ?? undefined}
          value={soil.texture ? fmtTexture(soil.texture) : `pH ${soil.ph!.toFixed(1)}`}
          delta={soil.texture && soil.ph !== null ? `pH ${soil.ph.toFixed(1)}` : soil.clay_pct !== null ? t("clay {v}%", { v: Math.round(soil.clay_pct) }) : undefined} />
      )}
      {field.crop && (
        <p className="flex items-center gap-1.5 border-t border-line py-2.5 text-[12px] font-medium text-mut">
          {field.crop.kind && <KindTag kind={field.crop.kind} />}
          <span>{t("Crop label: {source}", { source: field.crop.source })}{field.crop.year ? `, ${field.crop.year}` : ""}</span>
        </p>
      )}
    </div>
  );
}

/** Left panel: a row per field; under the selected one its indicators and the 8-day strip. */
export function FieldsPanel({ health, fieldId, onSelect }: { health: FarmHealth; fieldId: string | null; onSelect: (id: string) => void }) {
  const u = useUnits();
  const total = health.fields.reduce((s, f) => s + f.area_ha, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between px-[18px] pb-3 pt-[18px]">
        <h2 className="text-[16px] font-bold">{t("Fields")}</h2>
        <span className="text-[13px] text-mut">
          {tn(health.fields.length, "{n} field", "{n} fields")} · {fmtArea(total, u)}
        </span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {health.fields.map((f) => {
          const g = f.greenness?.value;
          return (
            <div key={f.id}>
              <FieldRow name={f.name} meta={cropMeta(f, u)} shape={f.boundary}
                value={g?.value != null ? fmtValue(g) : "–"} delta={g ? fmtDiff(g) : undefined} deltaNote={t("vs normal")}
                ndviStep={g?.value != null ? ndviStep(g.value) : null} tone={statusTone(f.status)}
                selected={f.id === fieldId} onSelect={() => onSelect(f.id)} />
              {f.id === fieldId && <FieldDetail health={health} field={f} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
