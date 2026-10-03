import { aggregateCandles, candleBucketStart } from "@/lib/market-data/aggregation";
import type { Candle, MarketDataProvider, Timeframe } from "@/lib/market-data/types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

/**
 * Load chart context without revealing price action after the review cutoff.
 *
 * Providers may return a complete higher-timeframe candle whose opening time
 * is before the cutoff even though its high, low, and close include later
 * one-minute bars. Replace that final bucket with an aggregation made only
 * from one-minute candles that were visible at the cutoff.
 */
export async function loadReplaySafeReviewCandles({
  provider,
  symbol,
  timeframe,
  startTime,
  cutoffTime,
  limit = 3000,
}: {
  provider: MarketDataProvider;
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  cutoffTime: number;
  limit?: number;
}): Promise<Candle[]> {
  const requested = await provider.getCandles({
    symbol,
    timeframe,
    startTime,
    endTime: cutoffTime,
    limit,
  });

  if (timeframe === "1m") {
    return requested.filter((candle) => candle.timestamp <= cutoffTime);
  }

  const currentBucket = candleBucketStart(cutoffTime, timeframe);
  const baseLimit = Math.ceil(TIMEFRAME_MS[timeframe] / TIMEFRAME_MS["1m"]) + 1;
  const revealedBase = await provider.getCandles({
    symbol,
    timeframe: "1m",
    startTime: currentBucket,
    endTime: cutoffTime,
    limit: baseLimit,
  });
  const partial = aggregateCandles(
    revealedBase.filter((candle) => candle.timestamp <= cutoffTime),
    "1m",
    timeframe,
  ).find((candle) => candle.timestamp === currentBucket);

  const safe = requested.filter(
    (candle) => candle.timestamp < currentBucket && candle.timestamp <= cutoffTime,
  );
  if (partial) safe.push(partial);
  safe.sort((a, b) => a.timestamp - b.timestamp);
  return safe.slice(0, limit);
}
