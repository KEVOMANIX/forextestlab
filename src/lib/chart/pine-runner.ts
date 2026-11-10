import { transpile, compile, Context } from "@nullarch/resin";
import { convertPineV4, isPineV4 } from "./pine-v4";

/** Candles as parallel arrays; times are epoch milliseconds. */
export type PineSeriesInput = { time: Float64Array; open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array; volume: Float64Array };
export type PineDiagnostic = { line: number; message: string };

/** Per-candle colors, or null when the color never changes. Hex, with optional alpha. */
type Colors = (string | null)[] | null;
export type PinePlot = { title: string; style: string; color: string; colors: Colors; linewidth: number; histbase: number; offset: number; forceOverlay: boolean; values: (number | null)[] };
export type PineHline = { title: string | null; price: number | null; color: string; linestyle: string; linewidth: number };
export type PineFillRef = { kind: "plot" | "hline"; index: number };
export type PineFill = { a: PineFillRef; b: PineFillRef; color: string; colors: Colors };
export type PineBackground = { color: string | null; colors: Colors; offset: number; forceOverlay: boolean };
export type PineMarker = { index: number; position: "aboveBar" | "belowBar" | "inBar"; shape: "arrowUp" | "arrowDown" | "circle" | "square"; color: string; text?: string; size: number; overlay: boolean };
export type PineVisual = { converted?: boolean; overlay: boolean; plots: PinePlot[]; hlines: PineHline[]; fills: PineFill[]; backgrounds: PineBackground[]; markers: PineMarker[]; skipped: string[] };
export type PineIndicatorResult = ({ ok: true } & PineVisual) | { ok: false; error: string; diagnostics?: PineDiagnostic[] };

const MAX_PLOTS = 64;
const MAX_MARKERS = 3_000;
const PALETTE = ["#2962FF", "#FF6D00", "#7B1FA2", "#00A86B"];
const HLINE_DEFAULT = "#787B86";
const FILL_DEFAULT = "#2962FF33";

/** Pine's chart timeframe string ("1", "15", "60", "D", "W", "M") for a candle length. */
export function pineTimeframe(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1440) return String(Math.max(1, minutes));
  if (minutes < 10_080) return minutes === 1440 ? "D" : `${Math.round(minutes / 1440)}D`;
  if (minutes < 40_000) return minutes === 10_080 ? "W" : `${Math.round(minutes / 10_080)}W`;
  const months = Math.max(1, Math.round(minutes / 43_200));
  return months === 1 ? "M" : `${months}M`;
}

/** Checks that apply before compiling: what this chart feed can and cannot supply. */
export function pineChartPrecheck(code: string): string | null {
  if (code.length < 1 || code.length > 20_000) return "Pine code must contain 1 to 20,000 characters.";
  if (!/^\s*\/\/\s*@version\s*=\s*[56]\s*$/m.test(code)) return "Add //@version=4, 5 or 6 on its own line. Pine versions 1 to 3 are not supported.";
  if (/^\s*strategy\s*\(/m.test(code)) return "This is a strategy script. Run strategies in Strategy Lab; the chart shows indicator() scripts.";
  if (!/^\s*indicator\s*\(/m.test(code)) return "Declare the script with indicator(\"Name\").";
  if (/^\s*import\s+/m.test(code)) return "Imported Pine libraries are not available on the chart.";
  if (/\brequest\s*\./.test(code)) return "request.* data from other symbols or timeframes is not available on the chart.";
  return null;
}

/** One color for the whole series when it never changes, so it travels cheaply. */
function compact(colors: (string | null)[] | null | undefined, fallback: string | null): { color: string | null; colors: Colors } {
  if (!colors || colors.length === 0) return { color: fallback, colors: null };
  const first = colors[0] ?? null;
  if (colors.every((value) => value === first)) return { color: first, colors: null };
  return { color: colors.find((value) => value != null) ?? fallback, colors };
}

const SHAPES: Record<string, PineMarker["shape"]> = {
  triangleup: "arrowUp", arrowup: "arrowUp", labelup: "arrowUp",
  triangledown: "arrowDown", arrowdown: "arrowDown", labeldown: "arrowDown",
  circle: "circle",
};
const SIZES: Record<string, number> = { tiny: 0.5, small: 0.75, normal: 1, auto: 1, large: 1.5, huge: 2 };
function position(location: string, shape: PineMarker["shape"]): PineMarker["position"] {
  if (location === "abovebar" || location === "top") return "aboveBar";
  if (location === "belowbar" || location === "bottom") return "belowBar";
  return shape === "arrowDown" ? "aboveBar" : shape === "arrowUp" ? "belowBar" : "inBar";
}

/**
 * hline() prices the compiler leaves unresolved (negative numbers, inputs and
 * simple constants), read from the script in declaration order.
 */
export function hlinePricesFromSource(code: string): (number | null)[] {
  const source = code.replace(/\/\/.*$/gm, "");
  const constants = new Map<string, number>();
  const assignment = /^\s*(?:var\s+|const\s+)?(?:(?:int|float|simple\s+\w+)\s+)?([A-Za-z_]\w*)\s*:?=\s*(.+)$/gm;
  for (const match of source.matchAll(assignment)) {
    const value = valueOf(match[2]!, constants);
    if (value != null) constants.set(match[1]!, value);
  }
  return [...source.matchAll(/\bhline\s*\(\s*(?:price\s*=\s*)?([^,()]+(?:\([^()]*\))?[^,()]*)/g)].map((match) => valueOf(match[1]!, constants));
}
function valueOf(expression: string, constants: Map<string, number>): number | null {
  const text = expression.trim();
  const literal = /^([+-]?\s*\d+(?:\.\d+)?)$/.exec(text);
  if (literal) return Number(literal[1]!.replace(/\s+/g, ""));
  const input = /^input(?:\.(?:int|float|price))?\s*\(\s*(?:defval\s*=\s*)?([+-]?\s*\d+(?:\.\d+)?)/.exec(text);
  if (input) return Number(input[1]!.replace(/\s+/g, ""));
  const negated = /^-\s*([A-Za-z_]\w*)$/.exec(text);
  if (negated && constants.has(negated[1]!)) return -constants.get(negated[1]!)!;
  return constants.get(text) ?? null;
}

type Compiled = { result: Extract<ReturnType<typeof transpile>, { ok: true }>; run: ReturnType<typeof compile> };
const compiled = new Map<string, Compiled | PineIndicatorResult>();

/**
 * Compiles (cached per script, symbol and timeframe) and runs a Pine indicator
 * over the given candles, returning what it draws: plots in their styles,
 * horizontal levels, fills, background colors and markers.
 */
export function runPineIndicator(code: string, data: PineSeriesInput, options: { symbol: string; timeframeMs: number; precision: number }): PineIndicatorResult {
  // Version 4 scripts are converted to v5 first, the way TradingView's converter does.
  const converted = isPineV4(code);
  if (converted) code = convertPineV4(code);
  const problem = pineChartPrecheck(code);
  if (problem) return { ok: false, error: problem };
  if (data.close.length < 1) return { ok: false, error: "No candles to calculate on yet." };
  const priceScale = 10 ** Math.max(0, Math.min(8, Math.round(options.precision)));
  const key = JSON.stringify([code, options.symbol, options.timeframeMs, priceScale]);
  let entry = compiled.get(key);
  if (!entry) {
    const result = transpile(code, {
      chartTf: pineTimeframe(options.timeframeMs),
      syminfo: { ticker: options.symbol, prefix: "FTL", mintick: 1 / priceScale, minmove: 1, pricescale: priceScale, pointvalue: 1, type: options.symbol === "XAUUSD" ? "cfd" : "forex", timezone: "UTC" },
      strategy: { initial_capital: 10_000 },
    });
    entry = result.ok
      ? { result, run: compile(result.code) }
      : { ok: false, error: "Fix the Pine script errors.", diagnostics: result.errors.map((message: string) => ({ line: Number(/\(L(\d+):\d+\)/.exec(message)?.[1] ?? 1), message })) };
    compiled.set(key, entry);
    while (compiled.size > 16) compiled.delete(compiled.keys().next().value!);
  }
  if ("ok" in entry) return entry;
  const { result, run } = entry;
  const series = {
    open: Array.from(data.open), high: Array.from(data.high), low: Array.from(data.low),
    close: Array.from(data.close), volume: Array.from(data.volume), time: Array.from(data.time),
  };
  try {
    const ctx = Context.from(result, series);
    const bar = run(ctx);
    for (let index = 0; index < ctx.barCount; index++) { ctx.advance(); bar(); }
    if (ctx.plots.length > MAX_PLOTS) return { ok: false, error: `Indicators can draw at most ${MAX_PLOTS} plots.` };
    const viz = result.viz;
    const colorsOf = (slot: number | null) => (slot !== null ? ctx.plotColors[slot] : null);

    const plots: PinePlot[] = ctx.plots.map((plot: { toArray(): number[] }, index: number) => {
      const meta = viz.plots[index];
      const { color, colors } = compact(colorsOf(meta?.colorSlot ?? null), meta?.color ?? null);
      return {
        title: meta?.title ?? `Plot ${index + 1}`,
        style: meta?.style ?? "line",
        color: color ?? PALETTE[index % PALETTE.length]!,
        colors,
        linewidth: meta?.linewidth ?? 1,
        histbase: meta?.histbase ?? 0,
        offset: meta?.offset ?? 0,
        forceOverlay: Boolean(meta?.forceOverlay),
        values: plot.toArray().map((value) => (Number.isFinite(value) ? value : null)),
      };
    });
    // Kept in declaration order: fill() refers to levels by position.
    const sourcePrices = hlinePricesFromSource(code);
    const hlines: PineHline[] = viz.hlines.map((line: { title: string | null; price: number | null; color: string | null; linestyle: string; linewidth: number }, index: number) => {
      const price = line.price != null && Number.isFinite(line.price) ? line.price : sourcePrices[index] ?? null;
      return { title: line.title, price, color: line.color ?? HLINE_DEFAULT, linestyle: line.linestyle, linewidth: line.linewidth };
    });
    const fills: PineFill[] = viz.fills.flatMap((fill: { a: PineFillRef | null; b: PineFillRef | null; color: string | null; colorSlot: number | null }) => {
      if (!fill.a || !fill.b) return [];
      const { color, colors } = compact(colorsOf(fill.colorSlot), fill.color);
      return [{ a: fill.a, b: fill.b, color: color ?? FILL_DEFAULT, colors }];
    });
    const backgrounds: PineBackground[] = viz.bgcolors.map((bg: { color: string | null; colorSlot: number | null; offset: number; forceOverlay: boolean }) => {
      const { color, colors } = compact(colorsOf(bg.colorSlot), bg.color);
      return { color, colors, offset: bg.offset, forceOverlay: bg.forceOverlay };
    });

    const markers: PineMarker[] = [];
    const conditionOf = (slot: number) => ctx.vizSeries[slot] ?? [];
    for (const shape of viz.shapes as { style: string; location: string; size: string; text: string | null; color: string | null; colorSlot: number | null; conditionSlot: number; offset: number; forceOverlay: boolean }[]) {
      const kind = SHAPES[shape.style] ?? "square";
      const perBar = colorsOf(shape.colorSlot);
      conditionOf(shape.conditionSlot).forEach((flag, index) => {
        if (flag !== 1) return;
        markers.push({ index: index + shape.offset, position: position(shape.location, kind), shape: kind, color: perBar?.[index] ?? shape.color ?? PALETTE[0]!, text: shape.text ?? undefined, size: SIZES[shape.size] ?? 1, overlay: viz.overlay || shape.forceOverlay });
      });
    }
    for (const char of viz.chars as { char: string; location: string; size: string; text: string | null; color: string | null; colorSlot: number | null; conditionSlot: number; offset: number; forceOverlay: boolean }[]) {
      const perBar = colorsOf(char.colorSlot);
      conditionOf(char.conditionSlot).forEach((flag, index) => {
        if (flag !== 1) return;
        markers.push({ index: index + char.offset, position: position(char.location, "circle"), shape: "circle", color: perBar?.[index] ?? char.color ?? PALETTE[0]!, text: [char.char, char.text].filter(Boolean).join(" "), size: 0.1, overlay: viz.overlay || char.forceOverlay });
      });
    }
    for (const arrow of viz.arrows as { colorup: string | null; colordown: string | null; seriesSlot: number; offset: number; forceOverlay: boolean }[]) {
      conditionOf(arrow.seriesSlot).forEach((value, index) => {
        if (!Number.isFinite(value) || value === 0) return;
        markers.push(value > 0
          ? { index: index + arrow.offset, position: "belowBar", shape: "arrowUp", color: arrow.colorup ?? "#4CAF50", size: 1, overlay: viz.overlay || arrow.forceOverlay }
          : { index: index + arrow.offset, position: "aboveBar", shape: "arrowDown", color: arrow.colordown ?? "#FF5252", size: 1, overlay: viz.overlay || arrow.forceOverlay });
      });
    }
    markers.sort((left, right) => left.index - right.index);

    const skipped: string[] = [];
    if (viz.barcolors.length) skipped.push("barcolor()");
    if (viz.candles.length || viz.plotbars.length) skipped.push("plotcandle()/plotbar()");
    if (ctx.drawingLog.length) skipped.push("labels, lines, boxes and tables");

    return { ok: true, converted, overlay: Boolean(viz.overlay), plots, hlines, fills, backgrounds, markers: markers.filter((marker) => marker.index >= 0 && marker.index < ctx.barCount).slice(-MAX_MARKERS), skipped };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The script stopped with an error." };
  }
}
