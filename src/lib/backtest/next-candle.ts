import { candleBucketStart } from "@/lib/market-data/aggregation";
import { isEmptyForexWeekendCandle } from "@/lib/market-data/empty-weekend";
import { nextTimeframeTimestamp, type Candle, type Timeframe } from "@/lib/market-data/types";

/** Last base candle of the next displayed bar; incomplete means fetch more data. */
export function nextCandleTarget(
  candles: readonly Candle[],
  visibleIndex: number,
  timeframe: Timeframe,
  symbol: string,
): { index: number; complete: boolean } {
  const current = candles[visibleIndex];
  if (!current) return { index: visibleIndex, complete: true };
  const afterCurrent = nextTimeframeTimestamp(candleBucketStart(current.timestamp, timeframe), timeframe);
  const firstAtOrAfter = (time: number) => {
    let low = visibleIndex + 1;
    let high = candles.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (candles[mid]!.timestamp < time) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  let first = firstAtOrAfter(afterCurrent);
  while (first < candles.length && isEmptyForexWeekendCandle(symbol, candles[first]!)) first += 1;
  if (first === candles.length) return { index: candles.length - 1, complete: false };
  const end = nextTimeframeTimestamp(candleBucketStart(candles[first]!.timestamp, timeframe), timeframe);
  const after = firstAtOrAfter(end);
  return { index: after - 1, complete: after < candles.length };
}
