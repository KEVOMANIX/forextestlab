import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ISeriesPrimitive,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PineBackground, PineFill, PineHline, PineMarker, PinePlot, PineVisual } from "@/lib/chart/pine-runner";

export type PineReport = Omit<PineVisual, "skipped"> & { skipped?: string[]; times: ArrayLike<number> };
type AnySeries = ISeriesApi<SeriesType>;
type Bitmap = { context: CanvasRenderingContext2D; horizontalPixelRatio: number; verticalPixelRatio: number; bitmapSize: { width: number; height: number } };
type Target = { useBitmapCoordinateSpace(draw: (scope: Bitmap) => void): void };

/** "#RRGGBBAA" → rgba(), which every canvas path accepts. */
export function cssColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(color);
  if (!match) return color;
  const value = parseInt(match[1]!, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${(parseInt(match[2]!, 16) / 255).toFixed(3)})`;
}
const TRANSPARENT = "rgba(0,0,0,0)";
const seconds = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
const colorAt = (item: { color: string | null; colors: (string | null)[] | null }, index: number) => (item.colors ? item.colors[index] ?? null : item.color);

/** What decides which series a script needs; any change rebuilds them. */
export function pineSignature(report: PineReport | undefined): string {
  if (!report) return "-";
  return [
    report.overlay ? "o" : "p",
    report.plots.map((plot) => `${plot.style}${plot.forceOverlay ? "!" : ""}`).join(","),
    report.hlines.length,
    report.fills.length ? "f" : "",
    report.backgrounds.length ? "b" : "",
    report.markers.some((marker) => marker.overlay) ? "M" : "",
    report.markers.some((marker) => !marker.overlay) ? "m" : "",
  ].join("|");
}

/** Index range of `times` (ms, ascending) inside the visible time range, with a bar of margin. */
function visibleIndexes(chart: IChartApi, times: ArrayLike<number>): [number, number] | null {
  const range = chart.timeScale().getVisibleRange();
  if (!range || times.length === 0) return null;
  const search = (target: number) => { let low = 0, high = times.length; while (low < high) { const mid = (low + high) >> 1; if (times[mid]! < target) low = mid + 1; else high = mid; } return low; };
  return [Math.max(0, search(Number(range.from) * 1000) - 2), Math.min(times.length - 1, search(Number(range.to) * 1000) + 2)];
}

/** Canvas layer for fill() bands and bgcolor() stripes, drawn behind the series. */
class AreaLayer implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: AnySeries | null = null;
  private requestUpdate: (() => void) | null = null;
  private report: PineReport | null = null;
  private visible = true;
  private readonly view: IPrimitivePaneView;

  constructor(private readonly kind: "fills" | "backgrounds", private readonly backgroundFilter: (background: PineBackground) => boolean = () => true) {
    const renderer: IPrimitivePaneRenderer = { draw: () => {}, drawBackground: (target) => this.draw(target as unknown as Target) };
    this.view = { zOrder: () => "bottom", renderer: () => renderer };
  }
  attached(param: SeriesAttachedParameter<Time>) { this.chart = param.chart as IChartApi; this.series = param.series as AnySeries; this.requestUpdate = param.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  paneViews() { return [this.view]; }
  updateAllViews() {}
  set(report: PineReport, visible: boolean) { this.report = report; this.visible = visible; this.requestUpdate?.(); }

  private draw(target: Target) {
    const { chart, series, report } = this;
    if (!chart || !series || !report || !this.visible) return;
    const span = visibleIndexes(chart, report.times);
    if (!span) return;
    const timeScale = chart.timeScale();
    const x = (index: number) => timeScale.timeToCoordinate(seconds(report.times[index]!));
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      if (this.kind === "backgrounds") {
        const half = (timeScale.options().barSpacing * hr) / 2;
        for (const background of report.backgrounds.filter(this.backgroundFilter)) {
          for (let index = span[0]; index <= span[1]; index++) {
            const source = index - background.offset;
            const color = cssColor(source >= 0 ? colorAt(background, source) : null);
            const left = x(index);
            if (!color || left == null) continue;
            context.fillStyle = color;
            context.fillRect(Math.floor(left * hr - half), 0, Math.ceil(half * 2) + 1, bitmapSize.height);
          }
        }
        return;
      }
      const valueOf = (fill: PineFill, side: "a" | "b", index: number): number | null => {
        const ref = fill[side];
        if (ref.kind === "hline") return report.hlines[ref.index]?.price ?? null;
        const plot = report.plots[ref.index];
        return plot ? plot.values[index - plot.offset] ?? null : null;
      };
      for (const fill of report.fills) {
        for (let index = Math.max(1, span[0]); index <= span[1]; index++) {
          const color = cssColor(colorAt(fill, index));
          const [a0, b0, a1, b1] = [valueOf(fill, "a", index - 1), valueOf(fill, "b", index - 1), valueOf(fill, "a", index), valueOf(fill, "b", index)];
          const [x0, x1] = [x(index - 1), x(index)];
          if (!color || a0 == null || b0 == null || a1 == null || b1 == null || x0 == null || x1 == null) continue;
          const ys = [series.priceToCoordinate(a0), series.priceToCoordinate(a1), series.priceToCoordinate(b1), series.priceToCoordinate(b0)];
          if (ys.some((y) => y == null)) continue;
          context.fillStyle = color;
          context.beginPath();
          context.moveTo(x0 * hr, ys[0]! * vr);
          context.lineTo(x1 * hr, ys[1]! * vr);
          context.lineTo(x1 * hr, ys[2]! * vr);
          context.lineTo(x0 * hr, ys[3]! * vr);
          context.closePath();
          context.fill();
        }
      }
    });
  }
}

const LINE_STYLES: Record<string, LineStyle> = { solid: LineStyle.Solid, dotted: LineStyle.Dotted, dashed: LineStyle.Dashed };
const lineWidth = (value: number) => Math.min(4, Math.max(1, Math.round(value) || 1)) as 1 | 2 | 3 | 4;

/**
 * Everything one Pine script draws on the chart. Built for one signature
 * (see pineSignature) and fed new values as candles arrive.
 */
export class PineRenderer {
  private plots: AnySeries[] = [];
  private hlines: ISeriesApi<"Line">[] = [];
  private anchor: ISeriesApi<"Line"> | null = null;
  private layers: { layer: AreaLayer; host: AnySeries }[] = [];
  private markerPlugins: { overlay: boolean; api: ISeriesMarkersPluginApi<Time> }[] = [];
  private previous: { first: number; length: number } | null = null;
  private built = false;

  constructor(private readonly chart: IChartApi, readonly paneIndex: number, private readonly priceSeries: AnySeries | null) {}

  /** First series in the script's own pane, for pane-level layers and markers. */
  private paneHost(): AnySeries {
    if (this.paneIndex === 0 && this.priceSeries) return this.priceSeries;
    const own = this.plots.find((_, index) => !this.forceOverlay[index]) ?? this.hlines[0];
    if (own) return own;
    this.anchor ??= this.chart.addSeries(LineSeries, { lineVisible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, color: TRANSPARENT }, this.paneIndex);
    return this.anchor;
  }
  private forceOverlay: boolean[] = [];

  private build(report: PineReport) {
    this.built = true;
    this.forceOverlay = report.plots.map((plot) => plot.forceOverlay);
    this.plots = report.plots.map((plot) => this.addPlot(plot, plot.forceOverlay ? 0 : this.paneIndex));
    this.hlines = report.hlines.map((line) => this.chart.addSeries(LineSeries, {
      color: cssColor(line.color) ?? undefined, lineWidth: lineWidth(line.linewidth), lineStyle: LINE_STYLES[line.linestyle] ?? LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, title: "",
    }, this.paneIndex));
    const host = this.paneHost();
    if (report.backgrounds.some((background) => !background.forceOverlay || this.paneIndex === 0)) {
      const layer = new AreaLayer("backgrounds", (background) => this.paneIndex === 0 || !background.forceOverlay);
      host.attachPrimitive(layer); this.layers.push({ layer, host });
    }
    if (this.paneIndex > 0 && this.priceSeries && report.backgrounds.some((background) => background.forceOverlay)) {
      const layer = new AreaLayer("backgrounds", (background) => background.forceOverlay);
      this.priceSeries.attachPrimitive(layer); this.layers.push({ layer, host: this.priceSeries });
    }
    if (report.fills.length) {
      // Bands are measured on the scale of the lines they join.
      const first = report.fills[0]!;
      const ref = first.a.kind === "plot" ? this.plots[first.a.index] : this.hlines[first.a.index];
      const fillHost = ref ?? host;
      const layer = new AreaLayer("fills");
      fillHost.attachPrimitive(layer); this.layers.push({ layer, host: fillHost });
    }
    if (report.markers.some((marker) => marker.overlay) && this.priceSeries) this.markerPlugins.push({ overlay: true, api: createSeriesMarkers(this.paneIndex === 0 ? host : this.priceSeries, []) });
    if (report.markers.some((marker) => !marker.overlay) && this.paneIndex > 0) this.markerPlugins.push({ overlay: false, api: createSeriesMarkers(host, []) });
  }

  private addPlot(plot: PinePlot, pane: number): AnySeries {
    const color = cssColor(plot.color) ?? "#2962FF";
    const common = { lastValueVisible: true, priceLineVisible: false, title: "" };
    if (plot.style === "histogram" || plot.style === "columns") return this.chart.addSeries(HistogramSeries, { ...common, color, base: plot.histbase }, pane);
    if (plot.style === "area" || plot.style === "areabr") return this.chart.addSeries(AreaSeries, { ...common, lineColor: color, topColor: withAlpha(color, 0.35), bottomColor: withAlpha(color, 0.02), lineWidth: lineWidth(plot.linewidth) }, pane);
    const dots = plot.style === "circles" || plot.style === "cross";
    return this.chart.addSeries(LineSeries, {
      ...common, color, lineWidth: lineWidth(plot.linewidth),
      lineType: plot.style.startsWith("stepline") ? LineType.WithSteps : LineType.Simple,
      lineVisible: !dots, pointMarkersVisible: dots, pointMarkersRadius: dots ? lineWidth(plot.linewidth) + 1 : undefined,
    }, pane);
  }

  private plotRow(plot: PinePlot, times: ArrayLike<number>, index: number): Record<string, unknown> | null {
    const time = seconds(times[index]!);
    const source = index - plot.offset;
    const value = source >= 0 ? plot.values[source] ?? null : null;
    const breaks = plot.style.endsWith("br");
    if (value == null) return breaks ? { time } : null;
    const color = cssColor(colorAt(plot, source));
    if (plot.style === "histogram" || plot.style === "columns") return color ? { time, value, color } : null;
    if (plot.style === "area" || plot.style === "areabr") return plot.colors ? { time, value, lineColor: color ?? TRANSPARENT, topColor: color ? withAlpha(color, 0.35) : TRANSPARENT, bottomColor: color ? withAlpha(color, 0.02) : TRANSPARENT } : { time, value };
    return plot.colors ? { time, value, color: color ?? TRANSPARENT } : { time, value };
  }

  update(report: PineReport, visible: boolean) {
    if (!this.built) this.build(report);
    const times = report.times;
    const first = times.length ? times[0]! : 0;
    const previous = this.previous;
    // The same history plus a few new candles: only touch the end of each line.
    const incremental = previous && previous.first === first && previous.length > 0 && times.length >= previous.length && times.length - previous.length <= 5;
    const start = incremental ? previous.length - 1 : 0;
    const write = (series: AnySeries, row: (index: number) => Record<string, unknown> | null) => {
      if (incremental) {
        for (let index = start; index < times.length; index++) {
          const item = row(index);
          if (item) { try { series.update(item as never); } catch { /* Out-of-order point; the next full redraw fixes it. */ } }
        }
        return;
      }
      const rows: Record<string, unknown>[] = [];
      for (let index = 0; index < times.length; index++) { const item = row(index); if (item) rows.push(item); }
      series.setData(rows as never);
    };
    this.plots.forEach((series, plotIndex) => {
      const plot = report.plots[plotIndex];
      series.applyOptions({ visible, lastValueVisible: visible });
      if (plot) write(series, (index) => this.plotRow(plot, times, index));
    });
    this.hlines.forEach((series, lineIndex) => {
      const line: PineHline | undefined = report.hlines[lineIndex];
      series.applyOptions({ visible });
      const price = line?.price;
      if (price != null) write(series, (index) => ({ time: seconds(times[index]!), value: price }));
    });
    if (this.anchor) write(this.anchor, (index) => ({ time: seconds(times[index]!), value: 0 }));
    for (const { layer } of this.layers) layer.set(report, visible);
    for (const plugin of this.markerPlugins) {
      plugin.api.setMarkers(visible ? report.markers.filter((marker) => marker.overlay === plugin.overlay && marker.index < times.length).map((marker) => toMarker(marker, times)) : []);
    }
    this.previous = { first, length: times.length };
  }

  dispose() {
    for (const plugin of this.markerPlugins) { try { plugin.api.detach(); } catch { /* The chart was rebuilt. */ } }
    for (const { layer, host } of this.layers) { try { host.detachPrimitive(layer); } catch { /* The chart was rebuilt. */ } }
    for (const series of [...this.plots, ...this.hlines, ...(this.anchor ? [this.anchor] : [])]) { try { this.chart.removeSeries(series); } catch { /* The chart was rebuilt. */ } }
    this.plots = []; this.hlines = []; this.anchor = null; this.layers = []; this.markerPlugins = [];
  }
}

function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) { const value = parseInt(hex[1]!, 16); return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`; }
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(color);
  if (rgba) return `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${(Number(rgba[4] ?? 1) * alpha).toFixed(3)})`;
  return color;
}

function toMarker(marker: PineMarker, times: ArrayLike<number>): SeriesMarker<Time> {
  return { time: seconds(times[marker.index]!), position: marker.position, shape: marker.shape, color: cssColor(marker.color) ?? "#2962FF", text: marker.text, size: marker.size };
}
