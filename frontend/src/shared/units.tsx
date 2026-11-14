import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

/** Display units. The API always speaks metric; conversion happens only when formatting. */
export type UnitSystem = "metric" | "us";

const STORAGE_KEY = "agromind.units";
const MM_PER_INCH = 25.4;
const HA_PER_ACRE = 0.40468564;
const KG_PER_LB = 0.45359237;
/** Pounds per bushel (USDA standard weights). */
const LB_PER_BUSHEL: Record<string, number> = { maize: 56, soybean: 60, oats: 32, winter_wheat: 60 };
const minus = "−";

function readStored(): UnitSystem {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "us" || v === "metric" ? v : "metric";
  } catch {
    return "metric"; // storage blocked (private window, previews)
  }
}

const sign = (x: number, digits: number) => {
  const s = Math.abs(x).toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : `${x > 0 ? "+" : minus}${s}`;
};

function formatters(system: UnitSystem) {
  const us = system === "us";
  return {
    system,
    /** Field area. */
    area: (ha: number) => (us ? `${(ha / HA_PER_ACRE).toFixed(0)} ac` : `${ha.toFixed(ha < 10 ? 1 : 0)} ha`),
    /** Water depth: rain, irrigation, crop water need. */
    water: (mm: number) => (us ? `${(mm / MM_PER_INCH).toFixed(1)} in` : `${Math.round(mm)} mm`),
    waterUnit: us ? "in" : "mm",
    waterValue: (mm: number) => (us ? mm / MM_PER_INCH : mm),
    /** Yield: bushels per acre for US grains, t/ha otherwise. */
    yieldPerArea: (tHa: number, cropId: string) => {
      const lb = LB_PER_BUSHEL[cropId];
      if (us && lb) return `${Math.round((tHa * 1000) / KG_PER_LB / lb * HA_PER_ACRE)} bu/ac`;
      return `${tHa.toFixed(1)} t/ha`;
    },
    /** Money per area, e.g. a margin. */
    moneyPerArea: (usdPerHa: number) => {
      const v = Math.round(us ? usdPerHa * HA_PER_ACRE : usdPerHa);
      return `${v < 0 ? minus : ""}$${Math.abs(v).toLocaleString("en-US")}`;
    },
    moneyUnit: us ? "/ac" : "/ha",
    moneyValue: (usdPerHa: number) => (us ? usdPerHa * HA_PER_ACRE : usdPerHa),
    temp: (c: number) => (us ? `${(c * 1.8 + 32).toFixed(1)} °F` : `${c.toFixed(1)} °C`),
    tempDelta: (dc: number, digits = 1) => (us ? `${sign(dc * 1.8, digits)} °F` : `${sign(dc, digits)} °C`),
  };
}

export type Units = ReturnType<typeof formatters> & { setSystem: (s: UnitSystem) => void };

const UnitsContext = createContext<Units | null>(null);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>(readStored);
  const setSystem = useCallback((s: UnitSystem) => {
    setSystemState(s);
    try {
      localStorage.setItem(STORAGE_KEY, s);
    } catch {
      /* not persisted: fine */
    }
  }, []);
  const value = useMemo(() => ({ ...formatters(system), setSystem }), [system, setSystem]);
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): Units {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnits must be used inside <UnitsProvider>");
  return ctx;
}
