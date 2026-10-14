import { TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market-data/types";

/** Only attach the continuous cached prefix immediately before the replay.
 * Separate visits can cache distant pages under the same session/symbol key.
 * Keeping the older island would make pagination skip the missing middle.
 */
export function adjacentHistory(candles: Candle[], before: number, timeframe: Timeframe, trustedCandles: Candle[] = []): Candle[] {
  const prior = candles.filter((candle) => candle.timestamp < before);
  const maximumGap = Math.max(7 * TIMEFRAME_MS["1d"], 3 * TIMEFRAME_MS[timeframe]);
  let next = before;
  let start = prior.length;
  while (start > 0) {
    const timestamp = prior[start - 1]!.timestamp;
    if (next - timestamp > maximumGap) break;
    next = timestamp;
    start -= 1;
  }
  // A freshly fetched source page can itself contain a real data outage.
  // Cache-island detection must not erase that page's valid earlier candles.
  if (start > 0 && trustedCandles.length > 0) {
    const trusted = new Set(trustedCandles.map(candle => candle.timestamp));
    return prior.filter((candle, index) => index >= start || trusted.has(candle.timestamp));
  }
  return prior.slice(start);
}
