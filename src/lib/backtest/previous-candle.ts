import { candleBucketStart } from "@/lib/market-data/aggregation";
import { isEmptyForexWeekendCandle } from "@/lib/market-data/empty-weekend";
import type { Candle, Timeframe } from "@/lib/market-data/types";

/** Remove one displayed candle, leaving the preceding candle fully revealed. */
export function previousCandleIndex(
  candles: readonly Candle[],
  visibleIndex: number,
  timeframe: Timeframe,
  symbol: string,
): number | null {
  let currentIndex = visibleIndex;
  // Older saved sessions may still contain the weekend placeholders hidden by
  // the chart. They must not count as a candle when stepping through that chart.
  while (currentIndex >= 0 && candles[currentIndex] && isEmptyForexWeekendCandle(symbol, candles[currentIndex]!)) {
    currentIndex -= 1;
  }
  const current = candles[currentIndex];
  if (!current) return null;
  const boundary = candleBucketStart(current.timestamp, timeframe);
  let low = 0;
  let high = currentIndex;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (candles[mid]!.timestamp < boundary) low = mid + 1;
    else high = mid;
  }
  let previous = low - 1;
  while (previous >= 0 && isEmptyForexWeekendCandle(symbol, candles[previous]!)) previous -= 1;
  return previous >= 0 ? previous : null;
}
