import { History } from "lucide-react";
import { InfoTip, KindTag } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { isTodayClimate, pct } from "../lib/format";
import { rotationColor } from "../lib/rotationColors";
import type { CropOption, SimulationResult } from "../types";
import { t } from "../../../shared/i18n";

const tone = (y: number) => (y < 0.7 ? "text-alert" : y < 0.9 ? "text-watch" : "text-ok");

/**
 * "What if 2012 happens again?": one historical starting year, its weather with the scenario applied, and
 * every rotation season by season. Built from per-track results, so switching years is instant.
 */
export function ReplayView({ result, crops, year, onYear }: {
  result: SimulationResult;
  crops: CropOption[];
  year: number;
  onYear: (y: number) => void;
}) {
  const u = useUnits();
  const years = result.ensemble_start_years;
  const k = Math.max(0, years.indexOf(year));
  const climate = result.yearly_climate;
  const yc = climate[k];
  const driest = [...climate].sort((a, b) => a.rain_mm - b.rain_mm)[0]?.year;
  const hottest = [...climate].sort((a, b) => b.tmax_c - a.tmax_c)[0]?.year;
  const today = isTodayClimate(result.scenario);
  const name = (id: string) => crops.find((c) => c.id === id)?.name ?? id;
  const rots = [...result.rotations].sort((a, b) => a.input_index - b.input_index);

  return (
    <section aria-labelledby="replay-h" className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 id="replay-h" className="flex items-center gap-1.5 text-[15px] font-bold">
            <History size={16} strokeWidth={1.75} className="text-mut" /> {t("Replay a year")}
            <InfoTip label={t("Replay a year")}>
              {t("Every result is the average over 25 runs, one starting in each year from 2001 to 2025. Here you see a single run: the weather starting in the year you pick")}{today ? "" : t(", with the scenario applied")}{t(", and how each rotation does season by season. Later seasons use the years that followed.")}
            </InfoTip>
          </h3>
          <KindTag kind="modelled" />
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm font-semibold">
          {t("Start in")}
          <select value={years[k]} onChange={(e) => onYear(Number(e.target.value))}
            className="rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm">
            {years.map((y) => (
              <option key={y} value={y} className="bg-ground">
                {y}{y === driest ? t(" (driest)") : y === hottest ? t(" (hottest)") : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[driest, hottest].filter((y, i, a) => y && a.indexOf(y) === i).map((y) => (
            <button key={y} type="button" onClick={() => onYear(y!)}
              className="rounded-chip border border-line px-2 py-1 text-[12px] font-semibold text-mut hover:bg-glass-hi hover:text-tx">
              {y === driest ? t("Driest: {y}", { y }) : t("Hottest: {y}", { y })}
            </button>
          ))}
        </div>
      </div>

      {yc && (
        <dl className="grid grid-cols-3 gap-2 rounded-chip border border-line bg-glass-hi p-2.5 text-[13px]">
          <div>
            <dt className="text-[12px] text-mut">{t("Rain May–Sep")}</dt>
            <dd className="font-extrabold text-rain">{u.water(today ? yc.rain_mm : yc.scenario_rain_mm)}</dd>
            {!today && <dd className="text-[12px] text-mut">{t("was {water}", { water: u.water(yc.rain_mm) })}</dd>}
          </div>
          <div>
            <dt className="text-[12px] text-mut">{t("Avg max temp")}</dt>
            <dd className="font-extrabold text-heat">{u.temp(today ? yc.tmax_c : yc.scenario_tmax_c)}</dd>
            {!today && <dd className="text-[12px] text-mut">{t("was {temp}", { temp: u.temp(yc.tmax_c) })}</dd>}
          </div>
          <div>
            <dt className="text-[12px] text-mut">{t("Days ≥ 35 °C")}</dt>
            <dd className="font-extrabold text-heat">{today ? yc.hot_days : yc.scenario_hot_days}</dd>
            {!today && <dd className="text-[12px] text-mut">{t("was {hot_days}", { hot_days: yc.hot_days })}</dd>}
          </div>
        </dl>
      )}

      <div className="space-y-3">
        {rots.map((r) => {
          const track = r.track_seasons[k] ?? [];
          return (
            <div key={r.rotation_id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold">
                <span className="flex min-w-0 items-center gap-2">
                  <i aria-hidden className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: rotationColor(r.input_index) }} />
                  <span className="truncate">{r.name}</span>
                </span>
                <span className={`shrink-0 text-[13px] ${tone(r.by_start_year[k])}`}>{t("avg {pct}", { pct: pct(r.by_start_year[k]) })}</span>
              </div>
              <ol className="flex flex-wrap gap-1">
                {r.seasons.map((s, i) => {
                  const calendar = years[(k + s.year - 1) % years.length];
                  const y = track[i];
                  return (
                    <li key={s.season_index} className="min-w-[64px] flex-1 rounded-chip bg-glass-hi px-2 py-1.5 text-center"
                      title={t("{name}, harvested in {calendar}'s weather", { name: name(s.crop_id), calendar })}>
                      <span className="block text-[11.5px] text-mut">{calendar}</span>
                      <span className="block truncate text-[12px] font-semibold">{name(s.crop_id)}</span>
                      <span className={`block text-[13px] font-extrabold ${y === undefined ? "" : tone(y)}`}>{y === undefined ? "–" : pct(y)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-mut">
        {t("Yield as a share of the crop's typical yield in today's climate. Green 90% or more, amber 70–90%, red below 70%.")}
      </p>
    </section>
  );
}
