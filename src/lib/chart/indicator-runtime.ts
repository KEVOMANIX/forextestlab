/**
 * Indicator runtime — the OO controller that binds a declarative
 * {@link IndicatorDef} + a user {@link IndicatorInstance} to lightweight-charts.
 *
 * Every indicator on the chart is one {@link Indicator} object. It owns its
 * series, and exposes the TradingView-style lifecycle:
 *
 *   initialize() → calculate() → draw() → (update() on new data) → destroy()
 *   serialize() / deserialize()  for persistence.
 *
 * Series are created on whatever chart is passed in, so the *same* class powers
 * both price-pane overlays (main chart) and own-pane oscillators (a dedicated
 * sub-chart). Rendering is delegated to lightweight-charts, which keeps the
 * indicator synchronized with pan / zoom / scaling and handles very large
 * candle counts natively.
 */

import {
  HistogramSeries,
  LineSeries,
  LineStyle,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type LineWidth,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";

import type { ComputeResult, IndicatorDef, IndicatorInstance, LineStyleName, PlotStyle } from "./indicator-defs";
import { getDef, hydrateInstance } from "./indicator-defs";
import type { MaybeNumber, OHLCV } from "./indicators";
import { recordReplayMetric } from "@/lib/performance/replay-metrics";

type AnySeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

export interface IndicatorValue {
  key: string;
  label: string;
  color: string;
  value: MaybeNumber;
}

/** A point as handed to lightweight-charts: a value, or whitespace at a time. */
type SeriesPoint = { time: UTCTimestamp; value?: number; color?: string };

function samePoint(a: SeriesPoint, b: SeriesPoint): boolean {
  return a.time === b.time && a.value === b.value && a.color === b.color;
}

const LINE_STYLE_MAP: Record<LineStyleName, LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
};

/** Convert #rrggbb (+ alpha 0..1) → rgba() string. Passes rgba()/named through. */
function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const int = parseInt(m[1]!, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity))})`;
}

type ThemeName = "dark" | "light";
type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(color: string): Rgba | null {
  const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const value = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
    return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16), a: 1 };
  }
  const functional = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i);
  return functional
    ? { r: Number(functional[1]), g: Number(functional[2]), b: Number(functional[3]), a: functional[4] == null ? 1 : Number(functional[4]) }
    : null;
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: Rgba, background: Rgba): number {
  const painted = {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
  const first = relativeLuminance(painted);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Preserve a plot's hue while ensuring it remains visible on either chart theme. */
export function indicatorColorForTheme(color: string, theme: ThemeName, minimumContrast = 3): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  const background = parseColor(theme === "light" ? "#f7faf8" : "#14231e")!;
  if (contrast(parsed, background) >= minimumContrast) return color;
  const target = theme === "light" ? 0 : 255;
  for (let amount = 0.12; amount <= 1; amount += 0.08) {
    const adjusted: Rgba = {
      r: Math.round(parsed.r + (target - parsed.r) * amount),
      g: Math.round(parsed.g + (target - parsed.g) * amount),
      b: Math.round(parsed.b + (target - parsed.b) * amount),
      a: 1,
    };
    if (contrast(adjusted, background) >= minimumContrast) {
      return `#${[adjusted.r, adjusted.g, adjusted.b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return theme === "light" ? "#17201c" : "#f4fff9";
}

function clampWidth(w: number): LineWidth {
  return Math.max(1, Math.min(4, Math.round(w))) as LineWidth;
}

/** Shift a series forward (offset > 0) / back (offset < 0) by N bars. */
function shift<T>(values: (T | null)[], offset: number, fill: T | null): (T | null)[] {
  if (!offset) return values;
  const out: (T | null)[] = new Array(values.length).fill(fill);
  for (let i = 0; i < values.length; i++) {
    const src = i - offset;
    if (src >= 0 && src < values.length) out[i] = values[src]!;
  }
  return out;
}

export class Indicator {
  readonly id: string;
  readonly paneIndex: number;
  private def: IndicatorDef;
  private inst: IndicatorInstance;
  private chart: IChartApi;
  private fallbackPrecision: number;
  private theme: ThemeName;

  private series = new Map<string, AnySeries>();
  private priceLines: IPriceLine[] = [];
  private result: ComputeResult | null = null;
  private inputsKey = "";
  private dataKey = "";
  /**
   * The points last pushed into each series, so the next draw can send only
   * what actually changed. Without this every replay candle re-sent the whole
   * history through `setData`, which rebuilds the series and makes the plot
   * visibly flicker.
   */
  private drawn = new Map<string, SeriesPoint[]>();
  private styleKeys = new Map<string, string>();
  private deferredHistory = false;

  /** `paneIndex` 0 = the main price pane; >0 = a dedicated oscillator pane. */
  constructor(chart: IChartApi, inst: IndicatorInstance, fallbackPrecision: number, paneIndex = 0, theme: ThemeName = "dark") {
    const def = getDef(inst.kind);
    if (!def) throw new Error(`Unknown indicator kind: ${inst.kind}`);
    this.chart = chart;
    this.def = def;
    this.inst = inst;
    this.id = inst.id;
    this.fallbackPrecision = fallbackPrecision;
    this.paneIndex = paneIndex;
    this.theme = theme;
  }

  getDef(): IndicatorDef {
    return this.def;
  }

  /** First plot's series — used as the anchor for cross-pane crosshair sync. */
  firstSeries(): AnySeries | null {
    const key = this.def.plots[0]?.key;
    return key ? this.series.get(key) ?? null : null;
  }

  /** Most recent finite value of the first plot (a sane price for crosshair sync). */
  lastFiniteValue(): number | null {
    const p = this.def.plots[0];
    if (!p || !this.result) return null;
    const arr = p.kind === "histogram" ? (this.result.histograms?.[p.key]?.map((b) => b.value) ?? []) : (this.result.lines?.[p.key] ?? []);
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]!;
    return null;
  }

  /** Values at a hovered candle, or the latest plotted values without a time. */
  valuesAt(timeSeconds: number | null = null): IndicatorValue[] {
    if (!this.result) return [];
    // Line values read before histograms, matching the order traders see in
    // TradingView-style legends (MACD, Signal, then Histogram).
    const plots = [...this.def.plots].sort((first, second) =>
      Number(first.kind === "histogram") - Number(second.kind === "histogram"),
    );
    return plots.flatMap<IndicatorValue>((plot) => {
      const style = this.inst.style[plot.key];
      if (style?.visible === false) return [];
      const points = this.drawn.get(plot.key) ?? [];
      if (timeSeconds != null) {
        const point = points.find((entry) => Number(entry.time) === timeSeconds);
        return [{
          key: plot.key,
          label: plot.label,
          color: indicatorColorForTheme(point?.color ?? style?.color ?? plot.defaultColor, this.theme),
          value: point?.value ?? null,
        }];
      }
      for (let index = points.length - 1; index >= 0; index -= 1) {
        const point = points[index];
        if (point?.value == null) continue;
        return [{
          key: plot.key,
          label: plot.label,
          color: indicatorColorForTheme(point.color ?? style?.color ?? plot.defaultColor, this.theme),
          value: point.value,
        }];
      }
      return [{
        key: plot.key,
        label: plot.label,
        color: indicatorColorForTheme(style?.color ?? plot.defaultColor, this.theme),
        value: null,
      }];
    });
  }

  latestValues(): IndicatorValue[] {
    return this.valuesAt();
  }

  /** Create one series per plot (+ oscillator guide lines). */
  initialize(): void {
    recordReplayMetric("indicator-create", 0);
    const precision = this.inst.precision ?? this.fallbackPrecision;
    const priceFormat = this.def.kind === "volume" || this.def.kind === "obv"
      ? { type: "volume" as const, precision: 0, minMove: 1 }
      : { type: "price" as const, precision, minMove: 1 / 10 ** precision };
    for (const plot of this.def.plots) {
      const series: AnySeries =
        plot.kind === "histogram"
          ? this.chart.addSeries(HistogramSeries, { priceFormat, priceLineVisible: false, lastValueVisible: true }, this.paneIndex)
          : this.chart.addSeries(LineSeries, { priceFormat, priceLineVisible: false, lastValueVisible: true }, this.paneIndex);
      this.series.set(plot.key, series);
    }
    // Guide lines (overbought / oversold / zero) on the first plot's series.
    const host = this.series.get(this.def.plots[0]?.key ?? "");
    if (host && this.def.hlines) {
      for (const h of this.def.hlines) {
        this.priceLines.push(
          host.createPriceLine({ price: h.value, color: indicatorColorForTheme(h.color, this.theme), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: h.label ?? "" }),
        );
      }
    }
    this.applyStyle();
  }

  /** Recompute plot data from candles (pure; no drawing). */
  calculate(candles: OHLCV[]): void {
    const startedAt = performance.now();
    this.result = this.def.compute(candles, this.inst.inputs);
    recordReplayMetric(
      "indicator-calculation",
      performance.now() - startedAt,
      candles.length,
    );
  }

  /** Push cached data + current style into the series. */
  draw(candles: OHLCV[], replace = false, replaying = false): void {
    if (!this.result) this.calculate(candles);
    const result = this.result!;
    const offset = typeof this.inst.inputs.offset === "number" ? this.inst.inputs.offset : 0;
    const times = candles.map((c) => c.time as UTCTimestamp);

    for (const plot of this.def.plots) {
      const series = this.series.get(plot.key);
      if (!series) continue;

      let data: SeriesPoint[];
      if (plot.kind === "histogram") {
        const bars = shift(result.histograms?.[plot.key] ?? [], offset, null);
        data = times.map((t, i) => {
          const bar = bars[i];
          return bar && bar.value != null
            ? { time: t, value: bar.value, color: bar.color ? indicatorColorForTheme(bar.color, this.theme) : undefined }
            : { time: t };
        });
      } else {
        const values = shift<number>(result.lines?.[plot.key] ?? [], offset, null);
        // Sparse plots (e.g. Zig Zag) omit undefined points so the line connects
        // across gaps instead of breaking at every whitespace bar.
        data = plot.sparse
          ? times.flatMap((t, i) => (values[i] == null ? [] : [{ time: t, value: values[i] as number }]))
          : times.map((t, i) => (values[i] == null ? { time: t } : { time: t, value: values[i] as number }));
      }
      this.push(plot.key, series, data, replace, replaying);
    }
    this.applyStyle();
  }

  /**
   * Send `data` to a series with as little work as possible.
   *
   * Replay normally revises the forming bar and appends the next one, so only
   * the tail differs. `update()` handles that without touching the rest of the
   * series; `setData` rebuilds it, which is what made the plots flicker on every
   * candle.
   *
   * `update()` cannot revise history — the library only accepts a point at or
   * after the last one — so anything that rewrites an earlier point falls back
   * to `setData`. That is the honest path for the indicators that genuinely do
   * revise history: a regression channel refits its whole window each bar, Zig
   * Zag can move a confirmed pivot, and an offset or Ichimoku displacement
   * shifts values away from the bar that produced them.
   */
  private push(
    key: string,
    series: AnySeries,
    data: SeriesPoint[],
    replace: boolean,
    replaying: boolean,
  ): void {
    const previous = this.drawn.get(key);
    this.drawn.set(key, data);

    if (replace || !previous || previous.length === 0) {
      series.setData(data as (LineData<Time> | HistogramData<Time> | WhitespaceData<Time>)[]);
      return;
    }
    if (replaying) {
      // Keep fast playback bounded: update only the former live point and any
      // appended points. History-revising indicators are reconciled once when
      // playback pauses instead of issuing thousands of chart mutations per
      // candle and freezing the tab.
      if (data.length < previous.length) return;
      const shared = previous.length;
      if (
        previous[0]?.time !== data[0]?.time ||
        previous[shared - 1]?.time !== data[shared - 1]?.time
      ) return;
      const tail = data[shared - 1]!;
      if (!samePoint(previous[shared - 1]!, tail)) {
        series.update(tail as LineData<Time> | HistogramData<Time> | WhitespaceData<Time>);
      }
      for (let i = shared; i < data.length; i++) {
        series.update(data[i]! as LineData<Time> | HistogramData<Time> | WhitespaceData<Time>);
      }
      return;
    }
    if (data.length < previous.length) {
      series.setData(data as (LineData<Time> | HistogramData<Time> | WhitespaceData<Time>)[]);
      return;
    }
    // A different timeline is a real data replacement (timeframe/history), not
    // a replay update.
    const shared = previous.length;
    for (let i = 0; i < shared; i++) {
      if (previous[i]!.time !== data[i]!.time) {
        series.setData(data as (LineData<Time> | HistogramData<Time> | WhitespaceData<Time>)[]);
        return;
      }
    }
    // Outside live playback, reconcile any revised history in one operation.
    for (let i = 0; i < shared - 1; i++) {
      if (!samePoint(previous[i]!, data[i]!)) {
        series.setData(data as (LineData<Time> | HistogramData<Time> | WhitespaceData<Time>)[]);
        return;
      }
    }
    for (let i = Math.max(0, shared - 1); i < data.length; i++) {
      const point = data[i]!;
      if (i < previous.length && samePoint(previous[i]!, point)) continue;
      series.update(point as LineData<Time> | HistogramData<Time> | WhitespaceData<Time>);
    }
  }

  /**
   * Apply per-plot colour / width / style / visibility (no recompute).
   *
   * Guarded by a key of what was last applied: `draw` runs on every replay
   * candle, and re-sending identical options each time is a redraw the chart
   * does not need.
   */
  applyStyle(): void {
    for (const plot of this.def.plots) {
      const series = this.series.get(plot.key);
      if (!series) continue;
      const s: PlotStyle = this.inst.style[plot.key] ?? {
        color: plot.defaultColor,
        lineWidth: plot.defaultLineWidth ?? 2,
        lineStyle: plot.defaultLineStyle ?? "solid",
        opacity: 1,
        visible: true,
      };
      const visible = this.inst.visible && s.visible;
      const color = indicatorColorForTheme(withOpacity(s.color, s.opacity), this.theme);
      const key = `${color}|${visible}|${s.lineWidth}|${s.lineStyle}`;
      if (this.styleKeys.get(plot.key) === key) continue;
      this.styleKeys.set(plot.key, key);
      if (plot.kind === "histogram") {
        (series as ISeriesApi<"Histogram">).applyOptions({ color, visible, lastValueVisible: visible });
      } else {
        (series as ISeriesApi<"Line">).applyOptions({
          color,
          lineWidth: clampWidth(s.lineWidth),
          lineStyle: LINE_STYLE_MAP[s.lineStyle],
          visible,
          lastValueVisible: visible,
        });
      }
    }
  }

  setTheme(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.styleKeys.clear();
    this.dataKey = "";
    this.drawn.clear();
    this.priceLines.forEach((line, index) => {
      const guide = this.def.hlines?.[index];
      if (guide) line.applyOptions({ color: indicatorColorForTheme(guide.color, theme) });
    });
  }

  /**
   * Reconcile with a new instance state + candles. Recomputes when the inputs
   * OR the candle data changed (new/updated bars during replay); a pure style /
   * visibility toggle skips the math and only re-applies options.
   */
  update(inst: IndicatorInstance, candles: OHLCV[], replaying = false): void {
    const last = candles[candles.length - 1];
    // Include the full latest bar because a forming candle can change its
    // high/low/open while its close remains unchanged. ATR, Supertrend and
    // range-based indicators must recalculate for those updates.
    const dataKey = `${candles.length}:${last ? `${last.time}:${last.open}:${last.high}:${last.low}:${last.close}:${last.volume ?? ""}` : ""}`;
    const inputsKey = JSON.stringify(inst.inputs);
    const inputsChanged = inputsKey !== this.inputsKey;
    const reconcileDeferred = !replaying && this.deferredHistory;
    const changed = inputsChanged || dataKey !== this.dataKey || !this.result || reconcileDeferred;
    this.inst = inst;
    this.inputsKey = inputsKey;
    this.dataKey = dataKey;
    if (changed) {
      this.calculate(candles);
      this.draw(candles, inputsChanged || reconcileDeferred, replaying);
      this.deferredHistory = replaying;
    } else {
      this.applyStyle();
    }
  }

  /** Remove all series + guide lines from the chart. */
  destroy(): void {
    recordReplayMetric("indicator-destroy", 0);
    for (const s of this.series.values()) {
      try {
        this.chart.removeSeries(s);
      } catch {
        // Series already gone (chart disposed) — ignore.
      }
    }
    this.series.clear();
    this.drawn.clear();
    this.styleKeys.clear();
    this.priceLines = [];
    this.result = null;
  }

  serialize(): IndicatorInstance {
    return this.inst;
  }

  static deserialize(raw: unknown): IndicatorInstance | null {
    return hydrateInstance(raw);
  }
}

/** Convenience: currently-plotted values keyed by plot label (for legends). */
export function latestValues(def: IndicatorDef, result: ComputeResult | null): { label: string; color: string; value: MaybeNumber }[] {
  if (!result) return [];
  return def.plots.map((p) => {
    const arr = p.kind === "histogram" ? (result.histograms?.[p.key]?.map((b) => b.value) ?? []) : (result.lines?.[p.key] ?? []);
    let value: MaybeNumber = null;
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) { value = arr[i]!; break; }
    return { label: p.label, color: p.defaultColor, value };
  });
}
