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

type AnySeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

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

  private series = new Map<string, AnySeries>();
  private priceLines: IPriceLine[] = [];
  private result: ComputeResult | null = null;
  private inputsKey = "";

  /** `paneIndex` 0 = the main price pane; >0 = a dedicated oscillator pane. */
  constructor(chart: IChartApi, inst: IndicatorInstance, fallbackPrecision: number, paneIndex = 0) {
    const def = getDef(inst.kind);
    if (!def) throw new Error(`Unknown indicator kind: ${inst.kind}`);
    this.chart = chart;
    this.def = def;
    this.inst = inst;
    this.id = inst.id;
    this.fallbackPrecision = fallbackPrecision;
    this.paneIndex = paneIndex;
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

  /** Create one series per plot (+ oscillator guide lines). */
  initialize(): void {
    const precision = this.inst.precision ?? this.fallbackPrecision;
    const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
    for (const plot of this.def.plots) {
      const series: AnySeries =
        plot.kind === "histogram"
          ? this.chart.addSeries(HistogramSeries, { priceFormat, priceLineVisible: false, lastValueVisible: false }, this.paneIndex)
          : this.chart.addSeries(LineSeries, { priceFormat, priceLineVisible: false, lastValueVisible: false }, this.paneIndex);
      this.series.set(plot.key, series);
    }
    // Guide lines (overbought / oversold / zero) on the first plot's series.
    const host = this.series.get(this.def.plots[0]?.key ?? "");
    if (host && this.def.hlines) {
      for (const h of this.def.hlines) {
        this.priceLines.push(
          host.createPriceLine({ price: h.value, color: h.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: h.label ?? "" }),
        );
      }
    }
    this.applyStyle();
  }

  /** Recompute plot data from candles (pure; no drawing). */
  calculate(candles: OHLCV[]): void {
    this.result = this.def.compute(candles, this.inst.inputs);
  }

  /** Push cached data + current style into the series. */
  draw(candles: OHLCV[]): void {
    if (!this.result) this.calculate(candles);
    const result = this.result!;
    const offset = typeof this.inst.inputs.offset === "number" ? this.inst.inputs.offset : 0;
    const times = candles.map((c) => c.time as UTCTimestamp);

    for (const plot of this.def.plots) {
      const series = this.series.get(plot.key);
      if (!series) continue;

      if (plot.kind === "histogram") {
        const bars = shift(result.histograms?.[plot.key] ?? [], offset, null);
        const data = times.map((t, i) => {
          const bar = bars[i];
          return bar && bar.value != null ? { time: t, value: bar.value, color: bar.color } : { time: t };
        });
        (series as ISeriesApi<"Histogram">).setData(data as (HistogramData<Time> | WhitespaceData<Time>)[]);
        continue;
      }

      const values = shift<number>(result.lines?.[plot.key] ?? [], offset, null);
      // Sparse plots (e.g. Zig Zag) omit undefined points so the line connects
      // across gaps instead of breaking at every whitespace bar.
      const data = plot.sparse
        ? times.flatMap((t, i) => (values[i] == null ? [] : [{ time: t, value: values[i] as number }]))
        : times.map((t, i) => (values[i] == null ? { time: t } : { time: t, value: values[i] as number }));
      (series as ISeriesApi<"Line">).setData(data as (LineData<Time> | WhitespaceData<Time>)[]);
    }
    this.applyStyle();
  }

  /** Apply per-plot colour / width / style / visibility (no recompute). */
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
      const color = withOpacity(s.color, s.opacity);
      if (plot.kind === "histogram") {
        (series as ISeriesApi<"Histogram">).applyOptions({ color, visible });
      } else {
        (series as ISeriesApi<"Line">).applyOptions({
          color,
          lineWidth: clampWidth(s.lineWidth),
          lineStyle: LINE_STYLE_MAP[s.lineStyle],
          visible,
        });
      }
    }
  }

  /**
   * Reconcile with a new instance state + candles. Recomputes only when inputs
   * changed (style / visibility toggles skip the math).
   */
  update(inst: IndicatorInstance, candles: OHLCV[]): void {
    const nextKey = JSON.stringify(inst.inputs);
    const inputsChanged = nextKey !== this.inputsKey;
    this.inst = inst;
    this.inputsKey = nextKey;
    if (inputsChanged || !this.result) {
      this.calculate(candles);
      this.draw(candles);
    } else {
      this.applyStyle();
    }
  }

  /** Remove all series + guide lines from the chart. */
  destroy(): void {
    for (const s of this.series.values()) {
      try {
        this.chart.removeSeries(s);
      } catch {
        // Series already gone (chart disposed) — ignore.
      }
    }
    this.series.clear();
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
