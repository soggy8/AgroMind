import { Droplets, Repeat, Thermometer } from "lucide-react";
import { KindTag } from "../../../shared/components";
import { useUnits } from "../../../shared/units";
import { pct, pctRange } from "../lib/format";
import { rotationColor } from "../lib/rotationColors";
import type { CropOption, SeasonResult, SimulationResult } from "../types";
import { t } from "../../../shared/i18n";

const LIMIT = {
  water: { icon: Droplets, label: t("water-limited"), cls: "text-rain" },
  heat: { icon: Thermometer, label: t("heat-limited"), cls: "text-heat" },
  rotation: { icon: Repeat, label: t("follows itself"), cls: "text-soil" },
} as const;

/** Season by season: what is planted when, and how each season fares across weather years. */
export function SeasonTable({ result, crops }: { result: SimulationResult; crops: CropOption[] }) {
  const name = (id: string) => crops.find((c) => c.id === id)?.name ?? id;
  const rots = [...result.rotations].sort((a, b) => a.input_index - b.input_index);
  return (
    <section aria-labelledby="seasons-h" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 id="seasons-h" className="text-[15px] font-bold">{t("Season by season")}</h3>
        <KindTag kind="modelled" />
      </div>
      {rots.map((r) => (
        <div key={r.rotation_id}>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <i aria-hidden className="h-2 w-2 rounded-[3px]" style={{ background: rotationColor(r.input_index) }} />
            {r.name}
          </div>
          <ol className="space-y-1">
            {r.seasons.map((s) => <SeasonRow key={s.season_index} s={s} cropName={name(s.crop_id)} />)}
          </ol>
        </div>
      ))}
      <p className="text-[12px] leading-snug text-mut">
        {t("Yield as a share of the crop's typical yield in today's climate; range across {ensemble_size} weather years. Icons show the main limit in a median year.", { ensemble_size: result.ensemble_size })}
      </p>
    </section>
  );
}

function SeasonRow({ s, cropName }: { s: SeasonResult; cropName: string }) {
  const u = useUnits();
  const limit = s.limiting_factor === "none" ? null : LIMIT[s.limiting_factor];
  return (
    <li className="grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-chip bg-glass-hi px-2.5 py-2">
      <span className="text-[12px] font-bold text-mut">{t("Year {year}", { year: s.year })}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {cropName}
          {limit && (
            <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${limit.cls}`}>
              <limit.icon size={13} strokeWidth={1.75} aria-hidden />{t(limit.label)}
            </span>
          )}
        </span>
        <span className="block text-[12px] text-mut">
          {t("{plant_date} – {harvest_date} · needs {water}", { plant_date: s.plant_date, harvest_date: s.harvest_date, water: u.water(s.crop_water_need_mm.p50) })}
          {s.irrigation_mm.p50 >= 1 && <> {t("· irrigated {water}", { water: u.water(s.irrigation_mm.p50) })}</>}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-[15px] font-extrabold">{pct(s.relative_yield.p50)}</span>
        <span className="block text-[12px] text-mut">
          {s.yield_t_ha ? u.yieldPerArea(s.yield_t_ha.p50, s.crop_id) : pctRange(s.relative_yield)}
        </span>
      </span>
    </li>
  );
}
