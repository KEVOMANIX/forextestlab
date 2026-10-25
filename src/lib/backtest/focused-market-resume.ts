import type { EngineContext } from "./types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

/** Target the next available focused-market candle while its primary clock
 * keeps trading. Only use downloaded candles; an unloaded tail is not a gap.
 * This chooses a target, never bypasses execution/accounting along the way.
 */
export function focusedMarketResumeIndex(ctx: EngineContext, symbol: string): number | null {
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
  return low < ctx.candles.length ? low : null;
}
