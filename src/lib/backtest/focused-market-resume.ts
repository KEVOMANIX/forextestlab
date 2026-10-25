import type { EngineContext } from "./types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

const MAX_MARKET_CLOSURE_MS = 4 * 24 * 60 * 60_000;

export function unexpectedReplayGap(ctx: EngineContext, symbol: string, throughIndex = ctx.state.visibleIndex + 1): { symbol: string; from: number; to: number } | null {
  const current = ctx.candles[ctx.state.visibleIndex];
  if (!current) return null;
  const limit = Math.max(MAX_MARKET_CLOSURE_MS, 2 * TIMEFRAME_MS[ctx.state.config.timeframe]);
  for (let index = ctx.state.visibleIndex + 1; index <= Math.min(throughIndex, ctx.candles.length - 1); index += 1) {
    const before = ctx.candles[index - 1]!, after = ctx.candles[index]!;
    if (after.timestamp - before.timestamp > limit) {
      return { symbol: ctx.state.config.symbol, from: before.timestamp, to: after.timestamp };
    }
  }
  const series = symbol === ctx.state.config.symbol ? undefined : ctx.pairCandles?.[symbol];
  if (!series?.length) return null;
  let low = 0, high = series.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (series[mid]!.timestamp <= current.timestamp) low = mid + 1;
    else high = mid;
  }
  const before = series[low - 1], after = series[low];
  return before && after && after.timestamp - before.timestamp > limit
    ? { symbol, from: before.timestamp, to: after.timestamp } : null;
}

/** Target the next available focused-market candle while its primary clock
 * keeps trading. Only use downloaded candles; an unloaded tail is not a gap.
 * This chooses a target, never bypasses execution/accounting along the way.
 */
export function focusedMarketResumeIndex(ctx: EngineContext, symbol: string): number | null {
  if (unexpectedReplayGap(ctx, symbol)) return null;
  if (symbol === ctx.state.config.symbol) return null;
  const current = ctx.candles[ctx.state.visibleIndex];
  const focused = ctx.pairCandles?.[symbol];
  if (!current || !focused?.length) return null;
  let low = 0;
  let high = focused.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (focused[mid]!.timestamp <= current.timestamp) low = mid + 1;
    else high = mid;
  }
  const next = focused[low];
  if (low === 0 || !next || next.timestamp - current.timestamp <= TIMEFRAME_MS[ctx.state.config.timeframe]) return null;
  low = ctx.state.visibleIndex + 1;
  high = ctx.candles.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ctx.candles[mid]!.timestamp < next.timestamp) low = mid + 1;
    else high = mid;
  }
  return low < ctx.candles.length && !unexpectedReplayGap(ctx, symbol, low) ? low : null;
}
