import type { MarketDataProvider } from "@/lib/market-data/types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";
import type { StrategyProgram } from "./parser";
import { createStrategyRunner, type StrategyRunOptions } from "./run";

const DAY = 86_400_000;
const monthStart = (time: number) => { const date = new Date(time); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1); };
const nextMonth = (time: number) => { const date = new Date(time); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1); };

export async function runStrategyRange(provider: Pick<MarketDataProvider, "getCandles">, program: StrategyProgram, options: StrategyRunOptions & { endTime: number; signal?: AbortSignal; onProgress?: (progress: { months: number; totalMonths: number; bars: number }) => void }) {
  const periods = program.signals.flatMap(signal => [signal.left, signal.right]).map(operand => operand.kind === "NUMBER" || operand.kind === "CLOSE" ? 0 : operand.period);
  const warmupBars = Math.max(60, ...periods.map(period => period * 2));
  const warmupStart = Math.max(0, options.startTime - TIMEFRAME_MS[program.timeframe] * warmupBars);
  const runner = createStrategyRunner(program, options);
  const totalMonths = (new Date(options.endTime).getUTCFullYear() - new Date(warmupStart).getUTCFullYear()) * 12 + new Date(options.endTime).getUTCMonth() - new Date(warmupStart).getUTCMonth() + 1;
  let months = 0;
  let previousTime = -1;
  for (let cursor = monthStart(warmupStart); cursor <= options.endTime; cursor = nextMonth(cursor)) {
    if (options.signal?.aborted) throw new DOMException("Test canceled.", "AbortError");
    const boundary = nextMonth(cursor);
    // Overlap lets the provider build complete New York-close daily candles
    // around month boundaries. Only this month's bars enter the runner.
    const candles = await provider.getCandles({ symbol: options.symbol.symbol, timeframe: program.timeframe, startTime: Math.max(0, cursor - 2 * DAY, warmupStart - 2 * DAY), endTime: Math.min(options.endTime + 2 * DAY, boundary + 2 * DAY) });
    for (const candle of candles.sort((a, b) => a.timestamp - b.timestamp)) {
      if (candle.timestamp < Math.max(cursor, warmupStart) || candle.timestamp >= boundary || candle.timestamp > options.endTime || candle.timestamp <= previousTime) continue;
      runner.push(candle);
      previousTime = candle.timestamp;
    }
    months++;
    options.onProgress?.({ months, totalMonths, bars: runner.bars });
  }
  if (runner.bars < 2) throw new Error("Too few candles in this period. Choose another market or date range.");
  return runner.finish();
}
