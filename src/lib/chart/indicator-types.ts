/**
 * Indicator instance model for the price chart.
 *
 * Each indicator the user adds is an independent instance (so you can have two
 * EMAs with different lengths). The catalog lists the *types* you can add; the
 * user configures length / source / offset / style per instance afterwards.
 */

export type IndKind = "ema" | "sma" | "bb" | "vwap" | "volume";
export type IndSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3";

export interface IndicatorInstance {
  id: string;
  kind: IndKind;
  length: number;
  source: IndSource;
  offset: number;
  bbStdDev: number;
  lineWidth: number;
  color: string;
  visible: boolean;
}

export interface IndicatorCatalogEntry {
  kind: IndKind;
  label: string;
  hasLength: boolean;
  hasSource: boolean;
  defaultLength: number;
  defaultColor: string;
}

/** Indicator types offered in the "add indicator" list — names only, no presets. */
export const INDICATOR_CATALOG: IndicatorCatalogEntry[] = [
  { kind: "ema", label: "Moving Average Exponential", hasLength: true, hasSource: true, defaultLength: 9, defaultColor: "#fbbf24" },
  { kind: "sma", label: "Moving Average Simple", hasLength: true, hasSource: true, defaultLength: 20, defaultColor: "#5b8bff" },
  { kind: "bb", label: "Bollinger Bands", hasLength: true, hasSource: true, defaultLength: 20, defaultColor: "#93a1b8" },
  { kind: "vwap", label: "VWAP", hasLength: false, hasSource: false, defaultLength: 0, defaultColor: "#22c3a0" },
  { kind: "volume", label: "Volume", hasLength: false, hasSource: false, defaultLength: 0, defaultColor: "#5b8bff" },
];

export const INDICATOR_SHORT: Record<IndKind, string> = {
  ema: "EMA",
  sma: "SMA",
  bb: "Bollinger Bands",
  vwap: "VWAP",
  volume: "Volume",
};

export const INDICATOR_SOURCES: { value: IndSource; label: string }[] = [
  { value: "close", label: "Close" },
  { value: "open", label: "Open" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "hl2", label: "HL2" },
  { value: "hlc3", label: "HLC3" },
];

let seq = 0;
export function makeIndicator(kind: IndKind): IndicatorInstance {
  const def = INDICATOR_CATALOG.find((d) => d.kind === kind)!;
  seq += 1;
  return {
    id: `ind_${kind}_${seq}_${Math.floor(performance.now())}`,
    kind,
    length: def.defaultLength,
    source: "close",
    offset: 0,
    bbStdDev: 2,
    lineWidth: kind === "bb" ? 1 : 2,
    color: def.defaultColor,
    visible: true,
  };
}

/** Legend label, e.g. "EMA 9" or "Bollinger Bands 20". */
export function indicatorLabel(inst: IndicatorInstance): string {
  const base = INDICATOR_SHORT[inst.kind];
  return inst.kind === "vwap" || inst.kind === "volume" ? base : `${base} ${inst.length}`;
}
