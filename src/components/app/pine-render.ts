import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type ISeriesPrimitive,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PinePlot, PineShape, PineVisual } from "@/lib/chart/pine-runner";
import { remapPineColor, type PineColorMap, type PineStyle } from "@/lib/chart/pine-scripts";

export type PineReport = Omit<PineVisual, "skipped" | "drawings"> & {
  drawings?: PineVisual["drawings"];
  skipped?: string[];
  times: ArrayLike<number>;
  /** Candle highs/lows/closes, which place shapes above/below bars. */
  highs?: ArrayLike<number>;
  lows?: ArrayLike<number>;
  closes?: ArrayLike<number>;
};
type AnySeries = ISeriesApi<SeriesType>;
type Bitmap = { context: CanvasRenderingContext2D; horizontalPixelRatio: number; verticalPixelRatio: number; bitmapSize: { width: number; height: number } };
type Media = { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } };
type Target = { useBitmapCoordinateSpace(draw: (scope: Bitmap) => void): void; useMediaCoordinateSpace(draw: (scope: Media) => void): void };

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
const paint = (item: { color: string | null; colors: (string | null)[] | null }, index: number, map: PineColorMap | undefined) => cssColor(remapPineColor(colorAt(item, index), map));

/** What decides which series a script needs; any change rebuilds them. */
export function pineSignature(report: PineReport | undefined): string {
  if (!report) return "-";
  return [
    report.overlay ? "o" : "p",
    report.plots.map((plot) => `${plot.style}${plot.forceOverlay ? "!" : ""}`).join(","),
    report.hlines.length,
    report.fills.length ? "f" : "",
    report.backgrounds.length ? "b" : "",
    report.shapes.some((shape) => shape.overlay) ? "S" : "",
    report.shapes.some((shape) => !shape.overlay) ? "s" : "",
    report.drawings?.length ? "d" : "",
  ].join("|");
}

/** Index range of `times` (ms, ascending) inside the visible time range, with a bar of margin. */
function visibleIndexes(chart: IChartApi, times: ArrayLike<number>): [number, number] | null {
  const range = chart.timeScale().getVisibleRange();
  if (!range || times.length === 0) return null;
  const search = (target: number) => { let low = 0, high = times.length; while (low < high) { const mid = (low + high) >> 1; if (times[mid]! < target) low = mid + 1; else high = mid; } return low; };
  return [Math.max(0, search(Number(range.from) * 1000) - 2), Math.min(times.length - 1, search(Number(range.to) * 1000) + 2)];
}

/** A canvas layer on one series' pane; subclasses draw from the latest report. */
abstract class Layer implements ISeriesPrimitive<Time> {
  protected chart: IChartApi | null = null;
  protected series: AnySeries | null = null;
  private requestUpdate: (() => void) | null = null;
  protected report: PineReport | null = null;
  protected style: PineStyle = {};
  protected visible = true;
  private readonly view: IPrimitivePaneView;

  constructor(zOrder: "bottom" | "top") {
    const renderer: IPrimitivePaneRenderer = zOrder === "bottom"
      ? { draw: () => {}, drawBackground: (target) => this.paint(target as unknown as Target) }
      : { draw: (target) => this.paint(target as unknown as Target) };
    this.view = { zOrder: () => zOrder, renderer: () => renderer };
  }
  attached(param: SeriesAttachedParameter<Time>) { this.chart = param.chart as IChartApi; this.series = param.series as AnySeries; this.requestUpdate = param.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  paneViews() { return [this.view]; }
  updateAllViews() {}
  set(report: PineReport, visible: boolean, style: PineStyle) { this.report = report; this.visible = visible; this.style = style; this.requestUpdate?.(); }
  private paint(target: Target) {
    const { chart, series, report } = this;
    if (!chart || !series || !report || !this.visible) return;
    const span = visibleIndexes(chart, report.times);
    if (span) this.draw(target, chart, series, report, span);
  }
  protected abstract draw(target: Target, chart: IChartApi, series: AnySeries, report: PineReport, span: [number, number]): void;
}

/** bgcolor() stripes behind the candles. */
class BackgroundLayer extends Layer {
  constructor(private readonly include: (index: number) => boolean) { super("bottom"); }
  protected draw(target: Target, chart: IChartApi, _series: AnySeries, report: PineReport, span: [number, number]) {
    const timeScale = chart.timeScale();
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hr, bitmapSize }) => {
      const half = (timeScale.options().barSpacing * hr) / 2;
      report.backgrounds.forEach((background, backgroundIndex) => {
        const custom = this.style.backgroundItems?.[backgroundIndex];
        if (!this.include(backgroundIndex) || custom?.visible === false || this.style.backgrounds === false) return;
        for (let index = span[0]; index <= span[1]; index++) {
          const source = index - background.offset;
          const color = source >= 0 ? paint(background, source, custom?.colors) : null;
          const left = timeScale.timeToCoordinate(seconds(report.times[index]!));
          if (!color || left == null) continue;
          context.fillStyle = color;
          context.fillRect(Math.floor(left * hr - half), 0, Math.ceil(half * 2) + 1, bitmapSize.height);
        }
      });
    });
  }
}

/** fill() bands, each run of one color drawn as a single polygon (no seams between bars). */
class FillLayer extends Layer {
  constructor() { super("bottom"); }
  protected draw(target: Target, chart: IChartApi, series: AnySeries, report: PineReport, span: [number, number]) {
    const timeScale = chart.timeScale();
    const valueOf = (ref: { kind: "plot" | "hline"; index: number }, index: number): number | null => {
      if (ref.kind === "hline") return report.hlines[ref.index]?.price ?? null;
      const plot = report.plots[ref.index];
      return plot ? plot.values[index - plot.offset] ?? null : null;
    };
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      report.fills.forEach((fill, fillIndex) => {
        const custom = this.style.fillItems?.[fillIndex];
        if (custom?.visible === false || this.style.fills === false) return;
        let run: { x: number; a: number; b: number }[] = [];
        let runColor: string | null = null;
        const flush = () => {
          if (run.length > 1 && runColor) {
            context.fillStyle = runColor;
            context.beginPath();
            run.forEach((point, index) => (index === 0 ? context.moveTo(point.x * hr, point.a * vr) : context.lineTo(point.x * hr, point.a * vr)));
            for (let index = run.length - 1; index >= 0; index--) context.lineTo(run[index]!.x * hr, run[index]!.b * vr);
            context.closePath();
            context.fill();
          }
          run = [];
        };
        for (let index = span[0]; index <= span[1]; index++) {
          const a = valueOf(fill.a, index), b = valueOf(fill.b, index);
          const left = timeScale.timeToCoordinate(seconds(report.times[index]!));
          const ya = a == null ? null : series.priceToCoordinate(a), yb = b == null ? null : series.priceToCoordinate(b);
          if (ya == null || yb == null || left == null) { flush(); runColor = null; continue; }
          // A band segment takes the color of the candle it ends on, as on TradingView.
          const color = paint(fill, index, custom?.colors);
          if (color !== runColor) {
            const last = run.at(-1);
            flush();
            if (last) run.push(last);
            runColor = color;
          }
          run.push({ x: left, a: ya, b: yb });
        }
        flush();
      });
    });
  }
}

const SHAPE_SIZE: Record<string, number> = { tiny: 7, small: 10, auto: 10, normal: 14, large: 20, huge: 28 };
const FONT_SIZE: Record<string, number> = { tiny: 10, small: 11, auto: 11, normal: 12, large: 14, huge: 18 };
const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

/** plotshape()/plotchar()/plotarrow() drawn the way TradingView draws them. */
class ShapeLayer extends Layer {
  constructor(private readonly onPrice: boolean, private readonly include: (shape: PineShape) => boolean) { super("top"); }
  protected draw(target: Target, chart: IChartApi, series: AnySeries, report: PineReport, span: [number, number]) {
    const timeScale = chart.timeScale();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const y = (price: number | undefined) => (price == null ? null : series.priceToCoordinate(price));
      report.shapes.forEach((shape, shapeIndex) => {
        const custom = this.style.shapes?.[shapeIndex];
        if (!this.include(shape) || custom?.visible === false || this.style.markers === false) return;
        const location = custom?.location ?? shape.location;
        const from = report.times[span[0]]!, to = report.times[span[1]]!;
        for (const point of shape.points) {
          const time = report.times[point.index];
          if (time == null || time < from || time > to) continue;
          const x = timeScale.timeToCoordinate(seconds(time));
          if (x == null) continue;
          const high = this.onPrice ? y(report.highs?.[point.index]) : null;
          const low = this.onPrice ? y(report.lows?.[point.index]) : null;
          if (shape.kind === "arrow") { drawArrow(ctx, shape, point.value ?? 0, x, high, low, mediaSize.height, custom?.colors); continue; }
          const color = cssColor(remapPineColor(colorAt(shape, point.index) ?? "#2962FF", custom?.colors)) ?? "#2962FF";
          const anchor = location === "absolute" ? y(point.price ?? report.closes?.[point.index]) : location === "abovebar" ? high : location === "belowbar" ? low : null;
          drawShape(ctx, shape, location, x, anchor, mediaSize.height, color);
        }
      });
    });
  }
}

function labelBox(ctx: CanvasRenderingContext2D, text: string, fontSize: number) {
  ctx.font = `600 ${fontSize}px ${FONT}`;
  return { width: Math.max(fontSize + 4, ctx.measureText(text).width + 10), height: fontSize + 6 };
}

function drawShape(ctx: CanvasRenderingContext2D, shape: PineShape, location: string, x: number, anchor: number | null, paneHeight: number, color: string) {
  const isLabel = shape.kind === "shape" && (shape.style === "labelup" || shape.style === "labeldown");
  const fontSize = FONT_SIZE[shape.size] ?? 11;
  const size = SHAPE_SIZE[shape.size] ?? 10;
  const pointer = 5;
  const box = isLabel ? labelBox(ctx, shape.text ?? "", fontSize) : shape.kind === "char" ? { width: size + 4, height: size + 4 } : { width: size, height: size };
  const height = box.height + (isLabel ? pointer : 0);
  // Where the shape's top edge goes, from its location.
  let top: number;
  if (location === "top") top = 4;
  else if (location === "bottom") top = paneHeight - 4 - height;
  else if (anchor == null) return;
  else if (location === "abovebar") top = anchor - 4 - height;
  else if (location === "belowbar") top = anchor + 4;
  else top = shape.style === "labelup" ? anchor : shape.style === "labeldown" ? anchor - height : anchor - height / 2;
  const below = location === "belowbar" || location === "bottom";

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (isLabel) {
    const up = shape.style === "labelup";
    const boxTop = up ? top + pointer : top;
    ctx.beginPath();
    ctx.roundRect(x - box.width / 2, boxTop, box.width, box.height, 3);
    ctx.fill();
    ctx.beginPath();
    if (up) { ctx.moveTo(x - pointer, boxTop + 0.5); ctx.lineTo(x, top); ctx.lineTo(x + pointer, boxTop + 0.5); }
    else { ctx.moveTo(x - pointer, boxTop + box.height - 0.5); ctx.lineTo(x, top + height); ctx.lineTo(x + pointer, boxTop + box.height - 0.5); }
    ctx.fill();
    if (shape.text) {
      ctx.fillStyle = cssColor(shape.textcolor) ?? "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(shape.text, x, boxTop + box.height / 2 + 0.5);
    }
    ctx.restore();
    return;
  }
  const cx = x, cy = top + box.height / 2, r = size / 2;
  if (shape.kind === "char") {
    ctx.font = `${size + 2}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.style, cx, cy);
  } else {
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.5, size / 6);
    switch (shape.style) {
      case "circle": ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); break;
      case "square": ctx.fillRect(cx - r, cy - r, size, size); break;
      case "diamond": ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); break;
      case "triangleup": ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.closePath(); ctx.fill(); break;
      case "triangledown": ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy - r); ctx.lineTo(cx, cy + r); ctx.closePath(); ctx.fill(); break;
      case "arrowup": ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx + r / 3, cy); ctx.lineTo(cx + r / 3, cy + r); ctx.lineTo(cx - r / 3, cy + r); ctx.lineTo(cx - r / 3, cy); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); break;
      case "arrowdown": ctx.moveTo(cx, cy + r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx + r / 3, cy); ctx.lineTo(cx + r / 3, cy - r); ctx.lineTo(cx - r / 3, cy - r); ctx.lineTo(cx - r / 3, cy); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); break;
      case "cross": ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); break;
      case "flag": ctx.lineWidth = 1.5; ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx - r, cy - r); ctx.stroke(); ctx.fillRect(cx - r, cy - r, size, size * 0.55); break;
      default: ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); break; // xcross
    }
  }
  if (shape.text) {
    ctx.font = `${FONT_SIZE[shape.size] ?? 11}px ${FONT}`;
    ctx.fillStyle = cssColor(shape.textcolor) ?? color;
    ctx.textAlign = "center";
    ctx.textBaseline = below ? "top" : "bottom";
    shape.text.split("\n").forEach((line, index, lines) => {
      const offset = below ? top + box.height + 3 + index * (fontSize + 2) : top - 3 - (lines.length - 1 - index) * (fontSize + 2);
      ctx.fillText(line, cx, offset);
    });
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, shape: PineShape, value: number, x: number, high: number | null, low: number | null, paneHeight: number, map: PineColorMap | undefined) {
  const up = value > 0;
  const color = cssColor(remapPineColor(up ? shape.colorup ?? "#4CAF50" : shape.colordown ?? "#FF5252", map)) ?? "#4CAF50";
  const length = Math.min(100, Math.max(5, 12 + Math.abs(value) * 8));
  const base = up ? (low ?? paneHeight - 4) + 4 : (high ?? 4) - 4;
  const tip = base;
  const tail = up ? base + length : base - length;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, tip); ctx.lineTo(x, tail); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, tip); ctx.lineTo(x - 4, up ? tip + 6 : tip - 6); ctx.lineTo(x + 4, up ? tip + 6 : tip - 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

type DrawingState = Record<string, number | string | null>;
const DRAWING_FONT: Record<string, number> = { tiny: 10, small: 11, auto: 12, normal: 12, large: 14, huge: 18 };
const DASHES: Record<string, number[]> = { dashed: [6, 4], dotted: [2, 3] };
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown) => (typeof value === "string" ? value : null);
const transparent = (color: string | null) => !color || /^#[0-9a-f]{6}00$/i.test(color);
/** A drawing color: the default when the script never set it, none when it set na. */
const colorField = (state: DrawingState, key: string, fallback: string): string | null => (key in state ? str(state[key]) : fallback);

/**
 * label.new/line.new/box.new/table.new drawings in their final state, as
 * TradingView shows them: boxes and lines in chart coordinates (bar time or
 * bar index, extendable to the pane edge), labels in their label styles and
 * tables pinned to their screen corner.
 */
class DrawingLayer extends Layer {
  constructor() { super("top"); }

  /** x pixel for a drawing coordinate; past the last candle it continues at the bar spacing. */
  private xOf(chart: IChartApi, report: PineReport, xloc: string | null, value: number | null): number | null {
    if (value == null) return null;
    const times = report.times;
    const last = times.length - 1;
    if (last < 0) return null;
    const timeScale = chart.timeScale();
    const spacing = timeScale.options().barSpacing;
    const at = (index: number) => timeScale.timeToCoordinate(seconds(times[index]!));
    if (xloc !== "bar_time") {
      const index = Math.round(value);
      if (index >= 0 && index <= last) return at(index);
      const edge = at(index < 0 ? 0 : last);
      return edge == null ? null : edge + (index < 0 ? index : index - last) * spacing;
    }
    let low = 0, high = last;
    while (low < high) { const mid = (low + high + 1) >> 1; if (times[mid]! <= value) low = mid; else high = mid - 1; }
    const base = at(low);
    if (base == null) return null;
    const step = low < last ? times[low + 1]! - times[low]! : last > 0 ? times[last]! - times[last - 1]! : 1;
    return base + ((value - times[low]!) / (step || 1)) * spacing;
  }

  protected draw(target: Target, chart: IChartApi, series: AnySeries, report: PineReport) {
    const drawings = report.drawings ?? [];
    if (!drawings.length || this.style.drawings === false) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const y = (price: unknown) => { const value = num(price); return value == null ? null : series.priceToCoordinate(value); };
      for (const pass of ["box", "line", "label", "table"] as const) {
        for (const drawing of drawings) {
          if (drawing.kind !== pass) continue;
          const state = drawing.state;
          ctx.save();
          if (pass === "box") this.box(ctx, chart, report, state, y, mediaSize.width);
          else if (pass === "line") this.line(ctx, chart, report, state, y, mediaSize.width, mediaSize.height);
          else if (pass === "label") this.label(ctx, chart, report, state, y);
          else this.table(ctx, chart, state, mediaSize);
          ctx.restore();
        }
      }
    });
  }

  private box(ctx: CanvasRenderingContext2D, chart: IChartApi, report: PineReport, state: DrawingState, y: (price: unknown) => number | null, width: number) {
    const xloc = str(state.xloc);
    let left = this.xOf(chart, report, xloc, num(state.left));
    let right = this.xOf(chart, report, xloc, num(state.right));
    const top = y(state.top), bottom = y(state.bottom);
    if (left == null || right == null || top == null || bottom == null) return;
    const extend = str(state.extend);
    if (extend === "left" || extend === "both") left = 0;
    if (extend === "right" || extend === "both") right = width;
    const fill = colorField(state, "bgcolor", "#2196F333");
    if (!transparent(fill)) { ctx.fillStyle = cssColor(fill)!; ctx.fillRect(left, top, right - left, bottom - top); }
    const border = colorField(state, "border_color", "#2196F3");
    const borderWidth = num(state.border_width) ?? 1;
    if (!transparent(border) && borderWidth > 0) {
      ctx.strokeStyle = cssColor(border)!;
      ctx.lineWidth = borderWidth;
      ctx.setLineDash(DASHES[str(state.border_style) ?? ""] ?? []);
      ctx.strokeRect(left + 0.5, top + 0.5, right - left, bottom - top);
    }
    const text = str(state.text);
    if (text) {
      ctx.fillStyle = cssColor(colorField(state, "text_color", "#D1D4DC")) ?? "transparent";
      ctx.font = `${DRAWING_FONT[str(state.text_size) ?? "auto"] ?? 12}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, (left + right) / 2, (top + bottom) / 2);
    }
  }

  private line(ctx: CanvasRenderingContext2D, chart: IChartApi, report: PineReport, state: DrawingState, y: (price: unknown) => number | null, width: number, height: number) {
    const xloc = str(state.xloc);
    let x1 = this.xOf(chart, report, xloc, num(state.x1)), x2 = this.xOf(chart, report, xloc, num(state.x2));
    let y1 = y(state.y1), y2 = y(state.y2);
    if (x1 == null || x2 == null || y1 == null || y2 == null) return;
    const color = colorField(state, "color", "#2196F3");
    if (transparent(color)) return;
    const extend = str(state.extend);
    if (extend && extend !== "none") {
      if (Math.abs(x2 - x1) < 0.5) {
        // A vertical line (session dividers, timestamps) extends up and/or down the pane.
        const up = y1 <= y2;
        if (extend === "both") { y1 = 0; y2 = height; }
        else if (extend === "right") { if (up) y2 = height; else y1 = height; }
        else { if (up) y1 = 0; else y2 = 0; }
      } else {
        // Otherwise the line keeps its slope out to the pane edge.
        const slope = (y2 - y1) / (x2 - x1);
        if (extend === "left" || extend === "both") { if (x1 <= x2) { y1 -= slope * x1; x1 = 0; } else { y2 -= slope * x2; x2 = 0; } }
        if (extend === "right" || extend === "both") { if (x2 >= x1) { y2 += slope * (width - x2); x2 = width; } else { y1 += slope * (width - x1); x1 = width; } }
      }
    }
    const style = str(state.style) ?? "solid";
    ctx.strokeStyle = cssColor(color)!;
    ctx.lineWidth = num(state.width) ?? 1;
    ctx.setLineDash(DASHES[style] ?? []);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    const head = (fromX: number, fromY: number, toX: number, toY: number) => {
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - 8 * Math.cos(angle - 0.45), toY - 8 * Math.sin(angle - 0.45));
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - 8 * Math.cos(angle + 0.45), toY - 8 * Math.sin(angle + 0.45));
      ctx.stroke();
    };
    if (style === "arrow_right" || style === "arrow_both") head(x1, y1, x2, y2);
    if (style === "arrow_left" || style === "arrow_both") head(x2, y2, x1, y1);
  }

  private label(ctx: CanvasRenderingContext2D, chart: IChartApi, report: PineReport, state: DrawingState, y: (price: unknown) => number | null) {
    const x = this.xOf(chart, report, str(state.xloc), num(state.x));
    if (x == null) return;
    const yloc = str(state.yloc);
    let anchor: number | null;
    // yloc.abovebar/belowbar place the label at that candle's high/low instead of its y.
    if (yloc === "abovebar" || yloc === "belowbar") {
      const xValue = num(state.x) ?? 0;
      const index = str(state.xloc) === "bar_time" ? Array.prototype.findIndex.call(report.times, (time: number) => time >= xValue) : Math.round(xValue);
      anchor = y(yloc === "abovebar" ? report.highs?.[index] : report.lows?.[index]);
    } else anchor = y(state.y);
    if (anchor == null) return;
    const text = str(state.text) ?? "";
    const style = (str(state.style) ?? "label_down").replace(/^style_/, "");
    const background = colorField(state, "color", "#2196F3");
    const filled = !transparent(background);
    const fontSize = DRAWING_FONT[str(state.size) ?? "normal"] ?? 12;
    ctx.font = `${fontSize}px ${FONT}`;
    const lines = text.split("\n");
    const textWidth = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
    const lineHeight = fontSize + 3;
    const padX = 6, padY = 3, pointer = filled ? 5 : 2;
    const boxWidth = textWidth + padX * 2, boxHeight = lines.length * lineHeight + padY * 2;
    let left = x - boxWidth / 2, top = anchor - boxHeight / 2;
    if (style === "label_down" || style === "arrowdown" || style === "triangledown") top = anchor - pointer - boxHeight;
    else if (style === "label_up" || style === "arrowup" || style === "triangleup") top = anchor + pointer;
    else if (style === "label_left") left = x + pointer;
    else if (style === "label_right") left = x - pointer - boxWidth;
    else if (style === "label_upper_left") { left = x + pointer; top = anchor + pointer; }
    else if (style === "label_upper_right") { left = x - pointer - boxWidth; top = anchor + pointer; }
    else if (style === "label_lower_left") { left = x + pointer; top = anchor - pointer - boxHeight; }
    else if (style === "label_lower_right") { left = x - pointer - boxWidth; top = anchor - pointer - boxHeight; }
    const boxStyle = style.startsWith("label_") && style !== "label_center";
    if (filled && (boxStyle || style === "label_center")) {
      ctx.fillStyle = cssColor(background)!;
      ctx.beginPath();
      ctx.roundRect(left, top, boxWidth, boxHeight, 3);
      ctx.fill();
      ctx.beginPath();
      if (style === "label_down") { ctx.moveTo(x - pointer, top + boxHeight - 0.5); ctx.lineTo(x, anchor); ctx.lineTo(x + pointer, top + boxHeight - 0.5); }
      else if (style === "label_up") { ctx.moveTo(x - pointer, top + 0.5); ctx.lineTo(x, anchor); ctx.lineTo(x + pointer, top + 0.5); }
      else if (style === "label_left") { ctx.moveTo(left + 0.5, anchor - pointer); ctx.lineTo(x, anchor); ctx.lineTo(left + 0.5, anchor + pointer); }
      else if (style === "label_right") { ctx.moveTo(left + boxWidth - 0.5, anchor - pointer); ctx.lineTo(x, anchor); ctx.lineTo(left + boxWidth - 0.5, anchor + pointer); }
      ctx.fill();
    } else if (filled && !boxStyle) {
      // Shape styles (circle, square, cross, …) draw their shape at the point with the text beside it.
      ctx.fillStyle = cssColor(background)!;
      ctx.beginPath();
      ctx.arc(x, anchor, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const textColor = colorField(state, "textcolor", filled ? "#FFFFFF" : "#D1D4DC");
    if (!text || transparent(textColor)) return;
    ctx.fillStyle = cssColor(textColor)!;
    ctx.textBaseline = "middle";
    const align = str(state.textalign);
    ctx.textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";
    const textX = ctx.textAlign === "left" ? left + padX : ctx.textAlign === "right" ? left + boxWidth - padX : left + boxWidth / 2;
    lines.forEach((line, index) => ctx.fillText(line, textX, top + padY + lineHeight * index + lineHeight / 2));
  }

  private table(ctx: CanvasRenderingContext2D, chart: IChartApi, state: DrawingState, size: { width: number; height: number }) {
    const cells = Object.entries(state).filter(([key]) => key.startsWith("cell:")).map(([key, value]) => {
      const [column, row] = key.slice(5).split(",").map(Number);
      return { column: column!, row: row!, text: String(value ?? "") };
    });
    if (cells.length === 0) return;
    // table.cell() colors are not carried by the engine, so the table takes the chart's own panel colors.
    const styles = getComputedStyle(chart.chartElement());
    const panel = styles.getPropertyValue("--app-panel-solid").trim() || "#1e302a";
    const border = styles.getPropertyValue("--app-border").trim() || "rgba(255,255,255,0.15)";
    const ink = styles.getPropertyValue("--chart-text").trim() || "#D1D4DC";
    ctx.font = `11px ${FONT}`;
    const columns = Math.max(...cells.map((cell) => cell.column)) + 1;
    const rows = Math.max(...cells.map((cell) => cell.row)) + 1;
    const widths = Array.from({ length: columns }, (_, column) => Math.max(18, ...cells.filter((cell) => cell.column === column).map((cell) => Math.max(...cell.text.split("\n").map((line) => ctx.measureText(line).width)) + 12)));
    const heights = Array.from({ length: rows }, (_, row) => Math.max(20, ...cells.filter((cell) => cell.row === row).map((cell) => cell.text.split("\n").length * 14 + 6)));
    const tableWidth = widths.reduce((sum, value) => sum + value, 0), tableHeight = heights.reduce((sum, value) => sum + value, 0);
    const position = str(state.position) ?? "top_right";
    const margin = 8;
    const left = position.endsWith("left") ? margin : position.endsWith("center") ? (size.width - tableWidth) / 2 : size.width - tableWidth - margin;
    const top = position.startsWith("top") ? margin + 24 : position.startsWith("middle") ? (size.height - tableHeight) / 2 : size.height - tableHeight - margin;
    ctx.fillStyle = panel;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(left, top, tableWidth, tableHeight);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, tableWidth, tableHeight);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const cell of cells) {
      const x = left + widths.slice(0, cell.column).reduce((sum, value) => sum + value, 0);
      const yTop = top + heights.slice(0, cell.row).reduce((sum, value) => sum + value, 0);
      const lines = cell.text.split("\n");
      lines.forEach((line, index) => ctx.fillText(line, x + widths[cell.column]! / 2, yTop + heights[cell.row]! / 2 + (index - (lines.length - 1) / 2) * 14));
    }
  }
}

const LINE_STYLES: Record<string, LineStyle> ={ solid: LineStyle.Solid, dotted: LineStyle.Dotted, dashed: LineStyle.Dashed };
const lineWidth = (value: number) => Math.min(4, Math.max(1, Math.round(value) || 1)) as 1 | 2 | 3 | 4;
const hiddenAnchor = { lineVisible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, color: TRANSPARENT, autoscaleInfoProvider: () => null };

/** A plot's color map, including the earlier single-color override. */
function plotColors(plot: PinePlot, custom: PineStyle["plots"] extends Record<string, infer T> | undefined ? T | undefined : never): PineColorMap | undefined {
  if (custom?.colors) return custom.colors;
  if (custom?.color && plot.color) return { [plot.color.toUpperCase()]: custom.color };
  return undefined;
}

/**
 * Everything one Pine script draws on the chart. Built for one signature
 * (see pineSignature) and fed new values as candles arrive.
 */
export class PineRenderer {
  private plots: AnySeries[] = [];
  private hlines: ISeriesApi<"Line">[] = [];
  private anchor: ISeriesApi<"Line"> | null = null;
  private layers: { layer: Layer; host: AnySeries }[] = [];
  private previous: { first: number; length: number; style: string } | null = null;
  private forceOverlay: boolean[] = [];
  private built = false;

  constructor(private readonly chart: IChartApi, readonly paneIndex: number, private readonly priceSeries: AnySeries | null) {}

  /** First series in the script's own pane, for pane-level layers. */
  private paneHost(): AnySeries {
    if (this.paneIndex === 0 && this.priceSeries) return this.priceSeries;
    const own = this.plots.find((_, index) => !this.forceOverlay[index]) ?? this.hlines[0];
    if (own) return own;
    this.anchor ??= this.chart.addSeries(LineSeries, hiddenAnchor, this.paneIndex);
    return this.anchor;
  }

  private attach(layer: Layer, host: AnySeries) { host.attachPrimitive(layer); this.layers.push({ layer, host }); }

  private build(report: PineReport) {
    this.built = true;
    this.forceOverlay = report.plots.map((plot) => plot.forceOverlay);
    this.plots = report.plots.map((plot) => this.addPlot(plot, plot.forceOverlay ? 0 : this.paneIndex));
    this.hlines = report.hlines.map((line) => this.chart.addSeries(LineSeries, {
      lineWidth: lineWidth(line.linewidth), lineStyle: LINE_STYLES[line.linestyle] ?? LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, title: "",
    }, this.paneIndex));
    const host = this.paneHost();
    const price = this.priceSeries;
    if (report.backgrounds.some((background) => !background.forceOverlay || this.paneIndex === 0)) {
      this.attach(new BackgroundLayer((index) => this.paneIndex === 0 || !report.backgrounds[index]?.forceOverlay), host);
    }
    if (this.paneIndex > 0 && price && report.backgrounds.some((background) => background.forceOverlay)) {
      this.attach(new BackgroundLayer((index) => Boolean(report.backgrounds[index]?.forceOverlay)), price);
    }
    if (report.fills.length) {
      // Bands are measured on the scale of the lines they join.
      const first = report.fills[0]!;
      this.attach(new FillLayer(), (first.a.kind === "plot" ? this.plots[first.a.index] : this.hlines[first.a.index]) ?? host);
    }
    // Shapes on the price pane are placed against candle highs/lows on the candle scale.
    if (report.shapes.some((shape) => shape.overlay) && (price || this.paneIndex === 0)) this.attach(new ShapeLayer(true, (shape) => shape.overlay), price ?? host);
    if (report.shapes.some((shape) => !shape.overlay) && this.paneIndex > 0) this.attach(new ShapeLayer(false, (shape) => !shape.overlay), host);
    if (report.drawings?.length) this.attach(new DrawingLayer(), this.paneIndex === 0 ? price ?? host : host);
  }

  private addPlot(plot: PinePlot, pane: number): AnySeries {
    const color = cssColor(plot.color) ?? "#2962FF";
    const common = { lastValueVisible: true, priceLineVisible: false, title: "" };
    if (plot.style === "histogram" || plot.style === "columns") return this.chart.addSeries(HistogramSeries, { ...common, color, base: plot.histbase }, pane);
    if (plot.style === "area" || plot.style === "areabr") return this.chart.addSeries(AreaSeries, { ...common, lineColor: color, topColor: withAlpha(color, 0.35), bottomColor: withAlpha(color, 0.02), lineWidth: lineWidth(plot.linewidth) }, pane);
    return this.chart.addSeries(LineSeries, { ...common, color, lineType: plot.style.startsWith("stepline") ? LineType.WithSteps : LineType.Simple }, pane);
  }

  private plotRow(plot: PinePlot, times: ArrayLike<number>, index: number, map: PineColorMap | undefined): Record<string, unknown> | null {
    const time = seconds(times[index]!);
    const source = index - plot.offset;
    const value = source >= 0 ? plot.values[source] ?? null : null;
    if (value == null) return null;
    const color = paint(plot, source, map);
    const varying = Boolean(plot.colors || map);
    if (plot.style === "histogram" || plot.style === "columns") return color ? { time, value, color } : null;
    if (plot.style === "area" || plot.style === "areabr") return varying ? { time, value, lineColor: color ?? TRANSPARENT, topColor: color ? withAlpha(color, 0.35) : TRANSPARENT, bottomColor: color ? withAlpha(color, 0.02) : TRANSPARENT } : { time, value };
    // A point's color paints the segment to the next point, so the last
    // point before an na gap is made transparent to break the line (linebr).
    const next = source + 1 < plot.values.length ? plot.values[source + 1] : 0;
    if (plot.style.endsWith("br") && next == null) return { time, value, color: TRANSPARENT };
    return varying || plot.style.endsWith("br") ? { time, value, color: color ?? TRANSPARENT } : { time, value };
  }

  update(report: PineReport, visible: boolean, style: PineStyle = {}) {
    if (!this.built) this.build(report);
    const times = report.times;
    const first = times.length ? times[0]! : 0;
    const styleKey = JSON.stringify(style);
    const previous = this.previous;
    // The same history plus a few new candles: only touch the end of each line.
    const incremental = previous && previous.style === styleKey && previous.first === first && previous.length > 0 && times.length >= previous.length && times.length - previous.length <= 5;
    const start = incremental ? previous.length - 1 : 0;
    const write = (series: AnySeries, row: (index: number) => Record<string, unknown> | null) => {
      if (incremental) {
        for (let index = Math.max(0, start - 1); index < times.length; index++) {
          const item = row(index);
          if (item) { try { series.update(item as never); } catch { /* Out-of-order point; the next full redraw fixes it. */ } }
        }
        return;
      }
      const rows: Record<string, unknown>[] = [];
      for (let index = 0; index < times.length; index++) { const item = row(index); if (item) rows.push(item); }
      series.setData(rows as never);
    };
    const priceFormat = style.precision != null ? { priceFormat: { type: "price" as const, precision: style.precision, minMove: 10 ** -style.precision } } : {};
    this.plots.forEach((series, plotIndex) => {
      const plot = report.plots[plotIndex];
      if (!plot) return;
      const custom = style.plots?.[String(plotIndex)];
      const map = plotColors(plot, custom);
      // linewidth=0 is how scripts plot a value only to anchor a fill.
      const dots = plot.style === "circles" || plot.style === "cross";
      const bars = plot.style === "histogram" || plot.style === "columns";
      const area = plot.style.startsWith("area");
      const effectiveWidth = custom?.linewidth ?? plot.linewidth;
      const shown = visible && custom?.visible !== false && (bars || area || effectiveWidth > 0);
      const width = lineWidth(effectiveWidth);
      const base = cssColor(remapPineColor(plot.color, map)) ?? undefined;
      const labels = shown && style.priceLabels !== false;
      series.applyOptions(bars ? { visible: shown, lastValueVisible: labels, color: base, ...priceFormat }
        : area ? { visible: shown, lastValueVisible: labels, lineColor: base, topColor: base && withAlpha(base, 0.35), bottomColor: base && withAlpha(base, 0.02), ...priceFormat }
          : { visible: shown, lastValueVisible: labels, color: base, lineWidth: width, lineVisible: !dots, pointMarkersVisible: dots, pointMarkersRadius: dots ? width + 1 : undefined, ...priceFormat });
      write(series, (index) => this.plotRow(plot, times, index, map));
    });
    this.hlines.forEach((series, lineIndex) => {
      const line = report.hlines[lineIndex];
      const custom = style.hlines?.[String(lineIndex)];
      series.applyOptions({ visible: visible && custom?.visible !== false, color: cssColor(custom?.color ?? line?.color) ?? undefined });
      const price = line?.price;
      if (price != null) write(series, (index) => ({ time: seconds(times[index]!), value: price }));
    });
    if (this.anchor) write(this.anchor, (index) => ({ time: seconds(times[index]!), value: 0 }));
    for (const { layer } of this.layers) layer.set(report, visible, style);
    this.previous = { first, length: times.length, style: styleKey };
  }

  dispose() {
    for (const { layer, host } of this.layers) { try { host.detachPrimitive(layer); } catch { /* The chart was rebuilt. */ } }
    for (const series of [...this.plots, ...this.hlines, ...(this.anchor ? [this.anchor] : [])]) { try { this.chart.removeSeries(series); } catch { /* The chart was rebuilt. */ } }
    this.plots = []; this.hlines = []; this.anchor = null; this.layers = [];
  }
}

function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) { const value = parseInt(hex[1]!, 16); return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`; }
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(color);
  if (rgba) return `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${(Number(rgba[4] ?? 1) * alpha).toFixed(3)})`;
  return color;
}
