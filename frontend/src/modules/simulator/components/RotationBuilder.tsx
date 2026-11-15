import { ArrowRight, Plus, Sparkles, Sprout, Trash2, X } from "lucide-react";
import { InfoTip } from "../../../shared/components";
import { rotationColor } from "../lib/rotationColors";
import type { CropOption, RotationInput } from "../types";
import { MAX_ROTATIONS } from "../types";
import { t } from "../../../shared/i18n";

const MAX_CROPS = 6;

/** Up to four rotations, each a sequence of crops. Each rotation keeps its colour everywhere. */
export function RotationBuilder({ rotations, crops, onCrops, onCoverCrop, onAdd, onRemove, onSuggest }: {
  rotations: RotationInput[];
  crops: CropOption[];
  onCrops: (rotationId: string, crops: string[]) => void;
  onCoverCrop: (rotationId: string, on: boolean) => void;
  onAdd: () => void;
  onRemove: (rotationId: string) => void;
  onSuggest: () => void;
}) {
  const cropName = (id: string) => crops.find((c) => c.id === id)?.name ?? id;
  return (
    <section aria-labelledby="rotations-h" data-tour="rotations" data-assist="sim.rotations">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="rotations-h" className="flex items-center gap-0.5 text-[15px] font-bold">
          {t("Rotations to compare")}
          <InfoTip label={t("Rotations and cover crops")}>
            {t("A rotation is the order crops follow each other on the field, repeated over the years you simulate. A rye cover crop is sown after harvest and ended two weeks before planting: it protects soil over winter and holds nitrogen (+15 soil index), uses some spring water, costs about $35/ac, and can trim maize yield slightly.")}
          </InfoTip>
        </h2>
        <span className="text-[13px] text-mut">{t("{length} of {MAX_ROTATIONS}", { length: rotations.length, MAX_ROTATIONS })}</span>
      </div>
      <ul className="space-y-1">
        {rotations.map((r, i) => (
          <li key={r.id} className="border-b border-line py-2.5 last:border-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: rotationColor(i) }} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={r.name}>{r.name}</span>
              {rotations.length > 1 && (
                <button type="button" onClick={() => onRemove(r.id)} aria-label={t("Remove {name}", { name: r.name })}
                  className="grid h-8 w-8 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-[18px]">
              {r.crops.map((c, j) => (
                <span key={`${c}-${j}`} className="flex items-center gap-1">
                  {j > 0 && <ArrowRight size={12} strokeWidth={1.75} className="text-mut" aria-hidden />}
                  <span className="inline-flex items-center gap-1 rounded-chip border border-line bg-glass-hi py-1 pl-2 pr-1 text-[13px] font-semibold">
                    {cropName(c)}
                    {r.crops.length > 1 && (
                      <button type="button" aria-label={t("Remove {cropName} from {name}", { cropName: cropName(c), name: r.name })}
                        onClick={() => onCrops(r.id, r.crops.filter((_, k) => k !== j))}
                        className="grid h-5 w-5 place-items-center rounded-[5px] text-mut hover:bg-glass-sel hover:text-tx">
                        <X size={12} strokeWidth={2} />
                      </button>
                    )}
                  </span>
                </span>
              ))}
              {r.crops.length < MAX_CROPS && (
                <label className="relative inline-flex">
                  <span className="sr-only">{t("Add a crop to {name}", { name: r.name })}</span>
                  <select value="" onChange={(e) => e.target.value && onCrops(r.id, [...r.crops, e.target.value])}
                    className="h-[30px] w-[30px] cursor-pointer appearance-none rounded-chip border border-dashed border-line bg-transparent text-transparent hover:bg-glass-hi">
                    <option value="">{t("Add crop")}</option>
                    {crops.map((c) => <option key={c.id} value={c.id} className="bg-ground text-tx">{c.name} ({c.season})</option>)}
                  </select>
                  <Plus size={14} strokeWidth={1.75} className="pointer-events-none absolute left-2 top-2 text-mut" aria-hidden />
                </label>
              )}
            </div>
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 pl-[18px] text-[13px] text-mut hover:text-tx">
              <input type="checkbox" checked={!!r.cover_crop} onChange={(e) => onCoverCrop(r.id, e.target.checked)}
                className="h-4 w-4 accent-[var(--color-lime)]" />
              <Sprout size={14} strokeWidth={1.75} className={r.cover_crop ? "text-ok" : ""} aria-hidden />
              {t("Rye cover crop over winter")}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {rotations.length < MAX_ROTATIONS && (
          <button type="button" onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-ctl px-2 py-1.5 text-[13px] font-semibold text-mut hover:bg-glass-hi hover:text-tx">
            <Plus size={14} strokeWidth={1.75} /> {t("Add rotation")}
          </button>
        )}
        <button type="button" onClick={onSuggest} data-tour="finder"
          className="inline-flex items-center gap-1.5 rounded-ctl px-2 py-1.5 text-[13px] font-semibold text-lime hover:bg-glass-hi">
          <Sparkles size={14} strokeWidth={1.75} /> {t("Suggest the best rotations")}
        </button>
      </div>
    </section>
  );
}
