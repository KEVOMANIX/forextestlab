/**
 * Indicator framework — declarative definitions + instance model.
 *
 * Each indicator *type* is described once by an {@link IndicatorDef}: its
 * metadata (name / short name / description / category), the pane it draws in
 * (shared price axis vs its own sub-pane), its configurable **inputs**, its
 * **plots** (each a stylable line / histogram), and a pure `compute()` that
 * turns candles + inputs into plot data. The runtime controller
 * (`indicator-runtime.ts`) wraps a def + a per-user {@link IndicatorInstance}
 * and drives the lifecycle against lightweight-charts.
 *
 * Adding a new indicator = adding one entry to {@link INDICATOR_DEFS}. Nothing
 * else needs to change: the catalog, settings dialog and rendering are all
 * metadata-driven.
 */

import {
  adx,
  atr,
  bollinger,
  cci,
  cmf,
  donchian,
  ema,
  hma,
  ichimoku,
  keltner,
  macd,
  mfi,
  movingAverage,
  obv,
  pickSource,
  roc,
  rsi,
  sessionVwap,
  sma,
  stdev,
  stochastic,
  stochRsi,
  supertrend,
  williamsR,
  wma,
  type MaybeNumber,
  type OHLCV,
  type PriceSource,
} from "./indicators";

export type IndCategory = "trend" | "momentum" | "volatility" | "volume";
export type IndPane = "price" | "own";
export type LineStyleName = "solid" | "dashed" | "dotted";

export const CATEGORY_LABELS: Record<IndCategory, string> = {
  trend: "Trend",
  momentum: "Momentum",
  volatility: "Volatility",
  volume: "Volume",
};

export const CATEGORY_ORDER: IndCategory[] = ["trend", "momentum", "volatility", "volume"];

export const SOURCE_OPTIONS: { value: PriceSource; label: string }[] = [
  { value: "close", label: "Close" },
  { value: "open", label: "Open" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "hl2", label: "HL2" },
  { value: "hlc3", label: "HLC3" },
  { value: "ohlc4", label: "OHLC4" },
];

const MA_TYPE_OPTIONS = [
  { value: "None", label: "None" },
  { value: "SMA", label: "SMA" },
  { value: "EMA", label: "EMA" },
  { value: "WMA", label: "WMA" },
  { value: "RMA", label: "RMA" },
];

// ── Schema types ───────────────────────────────────────────────────────────

export type InputType = "number" | "source" | "select" | "boolean";
export type InputSection = "inputs" | "smoothing" | "calculation";

export interface InputDef {
  key: string;
  label: string;
  type: InputType;
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  section?: InputSection;
}

export type PlotKind = "line" | "histogram";

export interface PlotDef {
  key: string;
  label: string;
  kind: PlotKind;
  defaultColor: string;
  defaultLineWidth?: number;
  defaultLineStyle?: LineStyleName;
}

export interface HLine {
  value: number;
  color: string;
  label?: string;
}

/** Per-plot style stored on an instance (overrides the plot's defaults). */
export interface PlotStyle {
  color: string;
  lineWidth: number;
  lineStyle: LineStyleName;
  opacity: number; // 0..1
  visible: boolean;
}

export type InputValues = Record<string, number | string | boolean>;

/** One histogram bar (value + optional per-bar colour). */
export interface HistBar {
  value: MaybeNumber;
  color?: string;
}

/** Output of an indicator's pure `compute()`, index-aligned to the candles. */
export interface ComputeResult {
  lines?: Record<string, MaybeNumber[]>;
  histograms?: Record<string, HistBar[]>;
}

export interface IndicatorDef {
  kind: string;
  name: string;
  description: string;
  category: IndCategory;
  pane: IndPane;
  inputs: InputDef[];
  plots: PlotDef[];
  /** Guide lines drawn on own-pane oscillators (overbought / zero / …). */
  hlines?: HLine[];
  /** Decimal precision for the plot's price scale; null → inherit chart precision. */
  precision?: number | null;
  /** Own-pane preferred pixel height. */
  paneHeight?: number;
  /** Short legend label, e.g. "EMA 9". */
  short: (inputs: InputValues) => string;
  compute: (candles: OHLCV[], inputs: InputValues) => ComputeResult;
}

// ── Instance model ───────────────────────────────────────────────────────────

export interface IndicatorInstance {
  id: string;
  kind: string;
  inputs: InputValues;
  style: Record<string, PlotStyle>;
  visible: boolean;
  /** null → inherit the chart's price precision. */
  precision: number | null;
}

// ── Compute helpers ────────────────────────────────────────────────────────

const num = (v: number | string | boolean | undefined, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const str = (v: number | string | boolean | undefined, d: string): string => (typeof v === "string" ? v : d);
const bool = (v: number | string | boolean | undefined, d: boolean): boolean => (typeof v === "boolean" ? v : d);

/** Apply a "smoothing MA" to a line that has leading nulls, keeping alignment. */
function smoothLine(values: MaybeNumber[], len: number, type: "SMA" | "EMA" | "WMA" | "RMA"): MaybeNumber[] {
  const first = values.findIndex((v) => v != null);
  if (first < 0) return values.map(() => null);
  const tail = values.slice(first).map((v) => v ?? 0);
  const sm = movingAverage(tail, len, type);
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  for (let i = 0; i < sm.length; i++) out[first + i] = sm[i] ?? null;
  return out;
}

// Shared input fragments.
const SOURCE_INPUT: InputDef = { key: "source", label: "Source", type: "source", default: "close", section: "inputs" };
const OFFSET_INPUT: InputDef = { key: "offset", label: "Offset", type: "number", default: 0, min: -500, max: 500, section: "inputs" };
const SMOOTHING_INPUTS: InputDef[] = [
  { key: "smoothingType", label: "Type", type: "select", default: "None", options: MA_TYPE_OPTIONS, section: "smoothing" },
  { key: "smoothingLength", label: "Length", type: "number", default: 14, min: 1, max: 500, section: "smoothing" },
];

/** A moving-average def factory (SMA/EMA/WMA/HMA share inputs + smoothing plot). */
function maDef(
  kind: string,
  name: string,
  shortName: string,
  color: string,
  defaultLength: number,
  fn: (values: number[], period: number) => MaybeNumber[],
): IndicatorDef {
  return {
    kind,
    name,
    description: `${name}. Smooths ${defaultLength}-bar price action into a single trend line.`,
    category: "trend",
    pane: "price",
    inputs: [
      { key: "length", label: "Length", type: "number", default: defaultLength, min: 1, max: 500, section: "inputs" },
      SOURCE_INPUT,
      OFFSET_INPUT,
      ...SMOOTHING_INPUTS,
    ],
    plots: [
      { key: "ma", label: "Plot", kind: "line", defaultColor: color, defaultLineWidth: 2 },
      { key: "smoothing", label: "Smoothing", kind: "line", defaultColor: "#e879f9", defaultLineWidth: 1 },
    ],
    precision: null,
    short: (i) => `${shortName} ${num(i.length, defaultLength)}`,
    compute: (candles, i) => {
      const src = pickSource(candles, str(i.source, "close") as PriceSource);
      const base = fn(src, num(i.length, defaultLength));
      const type = str(i.smoothingType, "None");
      const lines: Record<string, MaybeNumber[]> = { ma: base };
      if (type !== "None") lines.smoothing = smoothLine(base, num(i.smoothingLength, 14), type as "SMA" | "EMA" | "WMA" | "RMA");
      return { lines };
    },
  };
}

// ── The registry ─────────────────────────────────────────────────────────────

export const INDICATOR_DEFS: IndicatorDef[] = [
  // ── Trend (price pane) ──
  maDef("sma", "Moving Average Simple", "SMA", "#5b8bff", 20, sma),
  maDef("ema", "Moving Average Exponential", "EMA", "#fbbf24", 9, ema),
  maDef("wma", "Moving Average Weighted", "WMA", "#22c3a0", 20, wma),
  maDef("hma", "Hull Moving Average", "HMA", "#c084fc", 20, hma),
  {
    kind: "vwap",
    name: "VWAP (Session)",
    description: "Volume-weighted average price, reset each session. Optional ±σ bands.",
    category: "trend",
    pane: "price",
    inputs: [
      { key: "showBands", label: "Show bands", type: "boolean", default: false, section: "inputs" },
      { key: "bandMult", label: "Band multiplier", type: "number", default: 1, min: 0.1, max: 10, step: 0.1, section: "calculation" },
    ],
    plots: [
      { key: "vwap", label: "VWAP", kind: "line", defaultColor: "#22c3a0", defaultLineWidth: 2 },
      { key: "upper", label: "Upper band", kind: "line", defaultColor: "#93a1b8", defaultLineWidth: 1, defaultLineStyle: "dashed" },
      { key: "lower", label: "Lower band", kind: "line", defaultColor: "#93a1b8", defaultLineWidth: 1, defaultLineStyle: "dashed" },
    ],
    precision: null,
    short: () => "VWAP",
    compute: (candles, i) => {
      const { vwap, upper, lower } = sessionVwap(candles, num(i.bandMult, 1));
      const lines: Record<string, MaybeNumber[]> = { vwap };
      if (bool(i.showBands, false)) {
        lines.upper = upper;
        lines.lower = lower;
      }
      return { lines };
    },
  },
  {
    kind: "supertrend",
    name: "Supertrend",
    description: "ATR-based trailing stop. Green support line in uptrends, red resistance in downtrends.",
    category: "trend",
    pane: "price",
    inputs: [
      { key: "atrLength", label: "ATR Length", type: "number", default: 10, min: 1, max: 100, section: "inputs" },
      { key: "mult", label: "Factor", type: "number", default: 3, min: 0.5, max: 20, step: 0.1, section: "inputs" },
    ],
    plots: [
      { key: "up", label: "Uptrend", kind: "line", defaultColor: "#22c3a0", defaultLineWidth: 2 },
      { key: "down", label: "Downtrend", kind: "line", defaultColor: "#f4646c", defaultLineWidth: 2 },
    ],
    precision: null,
    short: (i) => `Supertrend ${num(i.atrLength, 10)} ${num(i.mult, 3)}`,
    compute: (candles, i) => {
      const pts = supertrend(candles, num(i.atrLength, 10), num(i.mult, 3));
      const up: MaybeNumber[] = pts.map((p) => (p.up === true ? p.value : null));
      const down: MaybeNumber[] = pts.map((p) => (p.up === false ? p.value : null));
      // Bridge the reversal bar so segments visually connect.
      for (let k = 1; k < pts.length; k++) {
        if (pts[k]!.up === true && pts[k - 1]!.up === false) up[k - 1] = pts[k]!.value;
        if (pts[k]!.up === false && pts[k - 1]!.up === true) down[k - 1] = pts[k]!.value;
      }
      return { lines: { up, down } };
    },
  },
  {
    kind: "ichimoku",
    name: "Ichimoku Cloud",
    description: "Tenkan / Kijun / Senkou A+B / Chikou. Cloud lines (fill not shaded in this build).",
    category: "trend",
    pane: "price",
    inputs: [
      { key: "tenkan", label: "Conversion Line Length", type: "number", default: 9, min: 1, max: 200, section: "inputs" },
      { key: "kijun", label: "Base Line Length", type: "number", default: 26, min: 1, max: 200, section: "inputs" },
      { key: "senkouB", label: "Leading Span B Length", type: "number", default: 52, min: 1, max: 400, section: "inputs" },
      { key: "displacement", label: "Displacement", type: "number", default: 26, min: 1, max: 200, section: "inputs" },
    ],
    plots: [
      { key: "tenkan", label: "Conversion (Tenkan)", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 1 },
      { key: "kijun", label: "Base (Kijun)", kind: "line", defaultColor: "#f4646c", defaultLineWidth: 1 },
      { key: "spanA", label: "Leading Span A", kind: "line", defaultColor: "#22c3a0", defaultLineWidth: 1 },
      { key: "spanB", label: "Leading Span B", kind: "line", defaultColor: "#e879f9", defaultLineWidth: 1 },
      { key: "chikou", label: "Lagging (Chikou)", kind: "line", defaultColor: "#93a1b8", defaultLineWidth: 1 },
    ],
    precision: null,
    short: () => "Ichimoku",
    compute: (candles, i) => {
      const r = ichimoku(candles, num(i.tenkan, 9), num(i.kijun, 26), num(i.senkouB, 52), num(i.displacement, 26));
      return { lines: { tenkan: r.tenkan, kijun: r.kijun, spanA: r.spanA, spanB: r.spanB, chikou: r.chikou } };
    },
  },

  // ── Volatility ──
  {
    kind: "bb",
    name: "Bollinger Bands",
    description: "SMA middle band with ±σ envelopes. Expansion = volatility.",
    category: "volatility",
    pane: "price",
    inputs: [
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500, section: "inputs" },
      SOURCE_INPUT,
      { key: "mult", label: "StdDev", type: "number", default: 2, min: 0.1, max: 10, step: 0.1, section: "calculation" },
      OFFSET_INPUT,
    ],
    plots: [
      { key: "upper", label: "Upper", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 1 },
      { key: "middle", label: "Basis", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 1, defaultLineStyle: "dashed" },
      { key: "lower", label: "Lower", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 1 },
    ],
    precision: null,
    short: (i) => `BB ${num(i.length, 20)}`,
    compute: (candles, i) => {
      const src = pickSource(candles, str(i.source, "close") as PriceSource);
      const b = bollinger(src, num(i.length, 20), num(i.mult, 2));
      return { lines: { upper: b.map((x) => x.upper), middle: b.map((x) => x.middle), lower: b.map((x) => x.lower) } };
    },
  },
  {
    kind: "keltner",
    name: "Keltner Channels",
    description: "EMA basis with ATR-scaled envelopes.",
    category: "volatility",
    pane: "price",
    inputs: [
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500, section: "inputs" },
      { key: "atrLength", label: "ATR Length", type: "number", default: 10, min: 1, max: 200, section: "inputs" },
      { key: "mult", label: "Multiplier", type: "number", default: 2, min: 0.1, max: 10, step: 0.1, section: "calculation" },
    ],
    plots: [
      { key: "upper", label: "Upper", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 1 },
      { key: "middle", label: "Basis", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 1, defaultLineStyle: "dashed" },
      { key: "lower", label: "Lower", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 1 },
    ],
    precision: null,
    short: (i) => `Keltner ${num(i.length, 20)}`,
    compute: (candles, i) => {
      const k = keltner(candles, num(i.length, 20), num(i.atrLength, 10), num(i.mult, 2));
      return { lines: { upper: k.map((x) => x.upper), middle: k.map((x) => x.middle), lower: k.map((x) => x.lower) } };
    },
  },
  {
    kind: "donchian",
    name: "Donchian Channels",
    description: "Highest high / lowest low over the period, with midline.",
    category: "volatility",
    pane: "price",
    inputs: [{ key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500, section: "inputs" }],
    plots: [
      { key: "upper", label: "Upper", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 1 },
      { key: "middle", label: "Basis", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 1, defaultLineStyle: "dashed" },
      { key: "lower", label: "Lower", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 1 },
    ],
    precision: null,
    short: (i) => `Donchian ${num(i.length, 20)}`,
    compute: (candles, i) => {
      const d = donchian(candles, num(i.length, 20));
      return { lines: { upper: d.map((x) => x.upper), middle: d.map((x) => x.middle), lower: d.map((x) => x.lower) } };
    },
  },
  {
    kind: "atr",
    name: "Average True Range",
    description: "Wilder ATR — average bar range, a raw volatility gauge.",
    category: "volatility",
    pane: "own",
    paneHeight: 120,
    inputs: [{ key: "length", label: "Length", type: "number", default: 14, min: 1, max: 500, section: "inputs" }],
    plots: [{ key: "atr", label: "ATR", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 2 }],
    precision: null,
    short: (i) => `ATR ${num(i.length, 14)}`,
    compute: (candles, i) => ({ lines: { atr: atr(candles, num(i.length, 14)) } }),
  },
  {
    kind: "stddev",
    name: "Standard Deviation",
    description: "Rolling standard deviation of the source.",
    category: "volatility",
    pane: "own",
    paneHeight: 120,
    inputs: [
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500, section: "inputs" },
      SOURCE_INPUT,
    ],
    plots: [{ key: "stddev", label: "StdDev", kind: "line", defaultColor: "#c084fc", defaultLineWidth: 2 }],
    precision: null,
    short: (i) => `StdDev ${num(i.length, 20)}`,
    compute: (candles, i) => ({ lines: { stddev: stdev(pickSource(candles, str(i.source, "close") as PriceSource), num(i.length, 20)) } }),
  },

  // ── Momentum (own pane) ──
  {
    kind: "rsi",
    name: "Relative Strength Index",
    description: "Wilder RSI. Overbought > 70, oversold < 30.",
    category: "momentum",
    pane: "own",
    paneHeight: 132,
    hlines: [
      { value: 70, color: "#f4646c", label: "70" },
      { value: 30, color: "#22c3a0", label: "30" },
    ],
    inputs: [
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 500, section: "inputs" },
      SOURCE_INPUT,
    ],
    plots: [{ key: "rsi", label: "RSI", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 2 }],
    precision: 2,
    short: (i) => `RSI ${num(i.length, 14)}`,
    compute: (candles, i) => ({ lines: { rsi: rsi(pickSource(candles, str(i.source, "close") as PriceSource), num(i.length, 14)) } }),
  },
  {
    kind: "macd",
    name: "MACD",
    description: "Moving Average Convergence Divergence — fast/slow EMA spread, signal line, histogram.",
    category: "momentum",
    pane: "own",
    paneHeight: 140,
    hlines: [{ value: 0, color: "#93a1b8" }],
    inputs: [
      { key: "fast", label: "Fast Length", type: "number", default: 12, min: 1, max: 200, section: "inputs" },
      { key: "slow", label: "Slow Length", type: "number", default: 26, min: 1, max: 400, section: "inputs" },
      { key: "signal", label: "Signal Smoothing", type: "number", default: 9, min: 1, max: 200, section: "inputs" },
      SOURCE_INPUT,
    ],
    plots: [
      { key: "hist", label: "Histogram", kind: "histogram", defaultColor: "#22c3a0" },
      { key: "macd", label: "MACD", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 2 },
      { key: "signal", label: "Signal", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 1 },
    ],
    precision: 5,
    short: (i) => `MACD ${num(i.fast, 12)} ${num(i.slow, 26)} ${num(i.signal, 9)}`,
    compute: (candles, i) => {
      const pts = macd(pickSource(candles, str(i.source, "close") as PriceSource), num(i.fast, 12), num(i.slow, 26), num(i.signal, 9));
      return {
        lines: { macd: pts.map((p) => p.macd), signal: pts.map((p) => p.signal) },
        histograms: {
          hist: pts.map((p) => ({ value: p.hist, color: p.hist == null ? undefined : p.hist >= 0 ? "rgba(34,195,160,0.6)" : "rgba(244,100,108,0.6)" })),
        },
      };
    },
  },
  {
    kind: "stoch",
    name: "Stochastic",
    description: "%K / %D stochastic oscillator. Overbought > 80, oversold < 20.",
    category: "momentum",
    pane: "own",
    paneHeight: 132,
    hlines: [
      { value: 80, color: "#f4646c", label: "80" },
      { value: 20, color: "#22c3a0", label: "20" },
    ],
    inputs: [
      { key: "k", label: "%K Length", type: "number", default: 14, min: 1, max: 200, section: "inputs" },
      { key: "kSmooth", label: "%K Smoothing", type: "number", default: 3, min: 1, max: 50, section: "inputs" },
      { key: "d", label: "%D Smoothing", type: "number", default: 3, min: 1, max: 50, section: "inputs" },
    ],
    plots: [
      { key: "k", label: "%K", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 2 },
      { key: "d", label: "%D", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 1 },
    ],
    precision: 2,
    short: (i) => `Stoch ${num(i.k, 14)} ${num(i.kSmooth, 3)} ${num(i.d, 3)}`,
    compute: (candles, i) => {
      const pts = stochastic(candles, num(i.k, 14), num(i.kSmooth, 3), num(i.d, 3));
      return { lines: { k: pts.map((p) => p.k), d: pts.map((p) => p.d) } };
    },
  },
  {
    kind: "stochrsi",
    name: "Stochastic RSI",
    description: "Stochastic of the RSI series — a faster momentum reading.",
    category: "momentum",
    pane: "own",
    paneHeight: 132,
    hlines: [
      { value: 80, color: "#f4646c", label: "80" },
      { value: 20, color: "#22c3a0", label: "20" },
    ],
    inputs: [
      { key: "rsiLen", label: "RSI Length", type: "number", default: 14, min: 1, max: 200, section: "inputs" },
      { key: "stochLen", label: "Stochastic Length", type: "number", default: 14, min: 1, max: 200, section: "inputs" },
      { key: "k", label: "%K Smoothing", type: "number", default: 3, min: 1, max: 50, section: "inputs" },
      { key: "d", label: "%D Smoothing", type: "number", default: 3, min: 1, max: 50, section: "inputs" },
      SOURCE_INPUT,
    ],
    plots: [
      { key: "k", label: "%K", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 2 },
      { key: "d", label: "%D", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 1 },
    ],
    precision: 2,
    short: () => "Stoch RSI",
    compute: (candles, i) => {
      const pts = stochRsi(pickSource(candles, str(i.source, "close") as PriceSource), num(i.rsiLen, 14), num(i.stochLen, 14), num(i.k, 3), num(i.d, 3));
      return { lines: { k: pts.map((p) => p.k), d: pts.map((p) => p.d) } };
    },
  },
  {
    kind: "cci",
    name: "Commodity Channel Index",
    description: "Deviation of typical price from its average. ±100 guides.",
    category: "momentum",
    pane: "own",
    paneHeight: 132,
    hlines: [
      { value: 100, color: "#f4646c", label: "100" },
      { value: -100, color: "#22c3a0", label: "-100" },
    ],
    inputs: [{ key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500, section: "inputs" }],
    plots: [{ key: "cci", label: "CCI", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 2 }],
    precision: 2,
    short: (i) => `CCI ${num(i.length, 20)}`,
    compute: (candles, i) => ({ lines: { cci: cci(candles, num(i.length, 20)) } }),
  },
  {
    kind: "williamsr",
    name: "Williams %R",
    description: "Close relative to the high-low range. −20 / −80 guides.",
    category: "momentum",
    pane: "own",
    paneHeight: 132,
    hlines: [
      { value: -20, color: "#f4646c", label: "-20" },
      { value: -80, color: "#22c3a0", label: "-80" },
    ],
    inputs: [{ key: "length", label: "Length", type: "number", default: 14, min: 1, max: 500, section: "inputs" }],
    plots: [{ key: "wr", label: "%R", kind: "line", defaultColor: "#c084fc", defaultLineWidth: 2 }],
    precision: 2,
    short: (i) => `Williams %R ${num(i.length, 14)}`,
    compute: (candles, i) => ({ lines: { wr: williamsR(candles, num(i.length, 14)) } }),
  },
  {
    kind: "roc",
    name: "Rate of Change",
    description: "Percent change over the lookback period.",
    category: "momentum",
    pane: "own",
    paneHeight: 120,
    hlines: [{ value: 0, color: "#93a1b8" }],
    inputs: [
      { key: "length", label: "Length", type: "number", default: 9, min: 1, max: 500, section: "inputs" },
      SOURCE_INPUT,
    ],
    plots: [{ key: "roc", label: "ROC", kind: "line", defaultColor: "#22c3a0", defaultLineWidth: 2 }],
    precision: 2,
    short: (i) => `ROC ${num(i.length, 9)}`,
    compute: (candles, i) => ({ lines: { roc: roc(pickSource(candles, str(i.source, "close") as PriceSource), num(i.length, 9)) } }),
  },
  {
    kind: "adx",
    name: "Average Directional Index",
    description: "Full DMI — +DI, −DI and ADX trend-strength line.",
    category: "momentum",
    pane: "own",
    paneHeight: 132,
    hlines: [{ value: 25, color: "#93a1b8", label: "25" }],
    inputs: [
      { key: "diLen", label: "DI Length", type: "number", default: 14, min: 1, max: 200, section: "inputs" },
      { key: "adxLen", label: "ADX Smoothing", type: "number", default: 14, min: 1, max: 200, section: "inputs" },
    ],
    plots: [
      { key: "adx", label: "ADX", kind: "line", defaultColor: "#fbbf24", defaultLineWidth: 2 },
      { key: "plusDI", label: "+DI", kind: "line", defaultColor: "#22c3a0", defaultLineWidth: 1 },
      { key: "minusDI", label: "-DI", kind: "line", defaultColor: "#f4646c", defaultLineWidth: 1 },
    ],
    precision: 2,
    short: (i) => `ADX ${num(i.diLen, 14)}`,
    compute: (candles, i) => {
      const pts = adx(candles, num(i.diLen, 14), num(i.adxLen, 14));
      return { lines: { adx: pts.map((p) => p.adx), plusDI: pts.map((p) => p.plusDI), minusDI: pts.map((p) => p.minusDI) } };
    },
  },

  // ── Volume (own pane) ──
  {
    kind: "volume",
    name: "Volume",
    description: "Per-bar volume histogram, coloured by candle direction.",
    category: "volume",
    pane: "own",
    paneHeight: 110,
    inputs: [],
    plots: [{ key: "volume", label: "Volume", kind: "histogram", defaultColor: "#5b8bff" }],
    precision: 0,
    short: () => "Volume",
    compute: (candles) => ({
      histograms: {
        volume: candles.map((c) => ({
          value: c.volume ?? 0,
          color: c.close >= c.open ? "rgba(34,195,160,0.5)" : "rgba(244,100,108,0.5)",
        })),
      },
    }),
  },
  {
    kind: "obv",
    name: "On Balance Volume",
    description: "Running cumulative volume, signed by price direction.",
    category: "volume",
    pane: "own",
    paneHeight: 120,
    inputs: [],
    plots: [{ key: "obv", label: "OBV", kind: "line", defaultColor: "#5b8bff", defaultLineWidth: 2 }],
    precision: 0,
    short: () => "OBV",
    compute: (candles) => ({ lines: { obv: obv(candles) } }),
  },
  {
    kind: "mfi",
    name: "Money Flow Index",
    description: "Volume-weighted RSI. Overbought > 80, oversold < 20.",
    category: "volume",
    pane: "own",
    paneHeight: 132,
    hlines: [
      { value: 80, color: "#f4646c", label: "80" },
      { value: 20, color: "#22c3a0", label: "20" },
    ],
    inputs: [{ key: "length", label: "Length", type: "number", default: 14, min: 1, max: 500, section: "inputs" }],
    plots: [{ key: "mfi", label: "MFI", kind: "line", defaultColor: "#c084fc", defaultLineWidth: 2 }],
    precision: 2,
    short: (i) => `MFI ${num(i.length, 14)}`,
    compute: (candles, i) => ({ lines: { mfi: mfi(candles, num(i.length, 14)) } }),
  },
  {
    kind: "cmf",
    name: "Chaikin Money Flow",
    description: "Accumulation / distribution over the period. Zero line.",
    category: "volume",
    pane: "own",
    paneHeight: 120,
    hlines: [{ value: 0, color: "#93a1b8" }],
    inputs: [{ key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500, section: "inputs" }],
    plots: [{ key: "cmf", label: "CMF", kind: "line", defaultColor: "#22c3a0", defaultLineWidth: 2 }],
    precision: 2,
    short: (i) => `CMF ${num(i.length, 20)}`,
    compute: (candles, i) => ({ lines: { cmf: cmf(candles, num(i.length, 20)) } }),
  },
];

// ── Registry lookup + instance factory / (de)serialization ────────────────────

const DEF_BY_KIND = new Map(INDICATOR_DEFS.map((d) => [d.kind, d]));

export function getDef(kind: string): IndicatorDef | undefined {
  return DEF_BY_KIND.get(kind);
}

export function defsByCategory(category: IndCategory): IndicatorDef[] {
  return INDICATOR_DEFS.filter((d) => d.category === category);
}

/** Build the default per-plot style map for a def. */
export function defaultStyle(def: IndicatorDef): Record<string, PlotStyle> {
  const style: Record<string, PlotStyle> = {};
  for (const p of def.plots) {
    style[p.key] = {
      color: p.defaultColor,
      lineWidth: p.defaultLineWidth ?? 2,
      lineStyle: p.defaultLineStyle ?? "solid",
      opacity: 1,
      visible: true,
    };
  }
  return style;
}

/** Build the default input values for a def. */
export function defaultInputs(def: IndicatorDef): InputValues {
  const inputs: InputValues = {};
  for (const inp of def.inputs) inputs[inp.key] = inp.default;
  return inputs;
}

let seq = 0;
export function makeInstance(kind: string): IndicatorInstance | null {
  const def = getDef(kind);
  if (!def) return null;
  seq += 1;
  return {
    id: `ind_${kind}_${seq}_${Math.floor(performance.now())}`,
    kind,
    inputs: defaultInputs(def),
    style: defaultStyle(def),
    visible: true,
    precision: def.precision ?? null,
  };
}

export function indicatorLabel(inst: IndicatorInstance): string {
  const def = getDef(inst.kind);
  return def ? def.short(inst.inputs) : inst.kind;
}

/**
 * Normalise a persisted / raw instance against the current def — fills missing
 * inputs & plot styles with defaults, and migrates the legacy flat model
 * (`{kind, length, source, offset, bbStdDev, lineWidth, color}`). Returns null
 * for unknown kinds so stale entries are dropped.
 */
export function hydrateInstance(raw: unknown): IndicatorInstance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = typeof r.kind === "string" ? r.kind : "";
  const def = getDef(kind);
  if (!def) return null;

  const inputs = defaultInputs(def);
  const style = defaultStyle(def);

  if (r.inputs && typeof r.inputs === "object") {
    // Current model — overlay saved input values that still exist in the schema.
    for (const inp of def.inputs) {
      const v = (r.inputs as Record<string, unknown>)[inp.key];
      if (typeof v === typeof inp.default) inputs[inp.key] = v as number | string | boolean;
    }
  } else {
    // Legacy flat model migration.
    if (typeof r.length === "number" && "length" in inputs) inputs.length = r.length;
    if (typeof r.source === "string" && "source" in inputs) inputs.source = r.source;
    if (typeof r.offset === "number" && "offset" in inputs) inputs.offset = r.offset;
    if (typeof r.bbStdDev === "number" && "mult" in inputs) inputs.mult = r.bbStdDev;
    if (typeof r.color === "string") for (const k of Object.keys(style)) style[k]!.color = r.color;
    if (typeof r.lineWidth === "number") for (const k of Object.keys(style)) style[k]!.lineWidth = r.lineWidth;
  }

  if (r.style && typeof r.style === "object") {
    for (const key of Object.keys(style)) {
      const s = (r.style as Record<string, unknown>)[key];
      if (s && typeof s === "object") {
        const so = s as Record<string, unknown>;
        const cur = style[key]!;
        if (typeof so.color === "string") cur.color = so.color;
        if (typeof so.lineWidth === "number") cur.lineWidth = so.lineWidth;
        if (so.lineStyle === "solid" || so.lineStyle === "dashed" || so.lineStyle === "dotted") cur.lineStyle = so.lineStyle;
        if (typeof so.opacity === "number") cur.opacity = so.opacity;
        if (typeof so.visible === "boolean") cur.visible = so.visible;
      }
    }
  }

  return {
    id: typeof r.id === "string" ? r.id : `ind_${kind}_${Math.floor(performance.now())}`,
    kind,
    inputs,
    style,
    visible: typeof r.visible === "boolean" ? r.visible : true,
    precision: typeof r.precision === "number" ? r.precision : def.precision ?? null,
  };
}
