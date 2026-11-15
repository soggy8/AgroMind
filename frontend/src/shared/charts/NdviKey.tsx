import { NDVI_BG } from "./ndvi";
import { t } from "../i18n";

const EDGES = ["0", "0.2", "0.4", "0.6", "0.8"];

/** The greenness key, always shown with the greenness scale (DESIGN.md section 7). A map pill. */
export function NdviKey({ className = "" }: { className?: string }) {
  return (
    <div className={`glass w-[270px] !rounded-[14px] px-3.5 py-2.5 text-[12px] text-mut ${className}`}
      role="img" aria-label={t("Greenness key: NDVI from 0, bare soil, to 0.8 and above, dense crop, in five steps of 0.2")}>
      <div className="flex justify-between font-semibold text-tx">
        <span>{t("Greenness (NDVI)")}</span>
      </div>
      <div className="mt-[7px] flex gap-[3px]">
        {NDVI_BG.map((bg) => <i key={bg} className={`h-2 flex-1 rounded-[3px] ${bg}`} />)}
      </div>
      <div className="mt-[5px] flex">
        {EDGES.map((e) => <span key={e} className="flex-1">{e}</span>)}
      </div>
      <div className="flex justify-between">
        <span>{t("bare soil")}</span>
        <span>{t("dense crop")}</span>
      </div>
    </div>
  );
}
