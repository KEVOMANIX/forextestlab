import { transpile, compile, Context } from "@nullarch/resin";

/** Candles as parallel arrays; times are epoch milliseconds. */
export type PineSeriesInput = { time: Float64Array; open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array; volume: Float64Array };
export type PineDiagnostic = { line: number; message: string };
export type PinePlot = { title: string; color: string; linewidth: number; values: (number | null)[] };
export type PineIndicatorResult =
  | { ok: true; overlay: boolean; plots: PinePlot[] }
  | { ok: false; error: string; diagnostics?: PineDiagnostic[] };

const MAX_PLOTS = 12;
const PALETTE = ["#2962FF", "#FF6D00", "#7B1FA2", "#00A86B"];

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
  if (!/^\s*\/\/@version=6\s*$/m.test(code)) return "Add //@version=6 on its own line. The chart runs Pine Script v6.";
  if (/^\s*strategy\s*\(/m.test(code)) return "This is a strategy script. Run strategies in Strategy Lab; the chart shows indicator() scripts.";
  if (!/^\s*indicator\s*\(/m.test(code)) return "Declare the script with indicator(\"Name\").";
  if (/^\s*import\s+/m.test(code)) return "Imported Pine libraries are not available on the chart.";
  if (/\brequest\s*\./.test(code)) return "request.* data from other symbols or timeframes is not available on the chart.";
  return null;
}

type Compiled = { result: Extract<ReturnType<typeof transpile>, { ok: true }>; run: ReturnType<typeof compile> };
const compiled = new Map<string, Compiled | PineIndicatorResult>();

/**
 * Compiles (cached per script, symbol and timeframe) and runs a Pine indicator
 * over the given candles, returning each plot() as a value per candle.
 */
export function runPineIndicator(code: string, data: PineSeriesInput, options: { symbol: string; timeframeMs: number; precision: number }): PineIndicatorResult {
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
    const context = Context.from(result, series);
    const bar = run(context);
    for (let index = 0; index < context.barCount; index++) { context.advance(); bar(); }
    if (context.plots.length > MAX_PLOTS) return { ok: false, error: `Indicators can draw at most ${MAX_PLOTS} plot() lines.` };
    return {
      ok: true,
      overlay: Boolean(result.viz.overlay),
      plots: context.plots.map((plot: { toArray(): number[] }, index: number) => ({
        title: result.viz.plots[index]?.title ?? `Plot ${index + 1}`,
        color: result.viz.plots[index]?.color ?? PALETTE[index % PALETTE.length]!,
        linewidth: result.viz.plots[index]?.linewidth ?? 1,
        values: plot.toArray().map((value) => (Number.isFinite(value) ? value : null)),
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The script stopped with an error." };
  }
}
