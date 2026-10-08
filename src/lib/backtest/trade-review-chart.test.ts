import { describe, expect, it } from "vitest";

import { loadReplaySafeReviewCandles } from "@/lib/backtest/trade-review-chart";
import type { Candle, CandleRequest, MarketDataProvider } from "@/lib/market-data/types";

function candle(timestamp: number, value: number, high = value): Candle {
  return { timestamp, open: String(value), high: String(high), low: String(value), close: String(value), source: "test" };
}

function providerFor(handler: (request: CandleRequest) => Candle[]): MarketDataProvider {
  return {
    getAvailableSymbols: async () => [],
    getAvailableRanges: async () => [],
    getCandles: async (request) => handler(request),
  };
}

describe("loadReplaySafeReviewCandles", () => {
  it("keeps Sunday opening data in Monday without revealing Monday's future prices", async () => {
    const start = Date.parse("2025-08-03T21:00:00Z");
    const cutoff = start + 2 * 60_000;
    const provider = providerFor((request) => {
      if (request.timeframe === "1d") return [candle(start, 1, 999)];
      expect(request.startTime).toBe(start);
      return [candle(start, 1), candle(cutoff, 2), candle(cutoff + 60_000, 999)];
    });
    const result = await loadReplaySafeReviewCandles({ provider, symbol: "EURUSD", timeframe: "1d", startTime: start, cutoffTime: cutoff });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ timestamp: start, open: "1", high: "2", close: "2" });
  });

  it("replaces a future-contaminated higher-timeframe candle with revealed one-minute data", async () => {
    const hour = 60 * 60_000;
    const cutoff = 10 * hour + 2 * 60_000;
    const provider = providerFor((request) => request.timeframe === "1h"
      ? [candle(9 * hour, 9), candle(10 * hour, 10, 999), candle(11 * hour, 11, 999)]
      : [candle(10 * hour, 10), candle(10 * hour + 60_000, 11), candle(cutoff, 12)]);

    const result = await loadReplaySafeReviewCandles({ provider, symbol: "EURUSD", timeframe: "1h", startTime: 9 * hour, cutoffTime: cutoff });

    expect(result.map((item) => item.timestamp)).toEqual([9 * hour, 10 * hour]);
    expect(result[1]).toMatchObject({ open: "10", high: "12", close: "12", source: "aggregated" });
  });

  it("drops one-minute candles after the cutoff", async () => {
    const provider = providerFor(() => [candle(1_000, 1), candle(2_000, 2), candle(3_000, 3)]);
    const result = await loadReplaySafeReviewCandles({ provider, symbol: "EURUSD", timeframe: "1m", startTime: 0, cutoffTime: 2_000 });
    expect(result.map((item) => item.timestamp)).toEqual([1_000, 2_000]);
  });
});
