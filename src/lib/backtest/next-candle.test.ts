import { describe, expect, it } from "vitest";
import { aggregateCandles, candleBucketStart } from "@/lib/market-data/aggregation";
import { TIMEFRAMES, nextTimeframeTimestamp, type Candle } from "@/lib/market-data/types";
import { nextCandleTarget } from "./next-candle";

const minute = 60_000;
const candle = (timestamp: number): Candle => ({
  timestamp, open: "1.1", high: "1.3", low: "1", close: "1.2", volume: "10", source: "aggregated",
});

describe("next displayed candle", () => {
  it.each(TIMEFRAMES)("reveals exactly the next full %s bar", (timeframe) => {
    const start = candleBucketStart(Date.UTC(2025, 0, 7, 12), timeframe);
    const next = nextTimeframeTimestamp(start, timeframe);
    const third = nextTimeframeTimestamp(next, timeframe);
    const candles = [...new Set([start, next - minute, next, third - minute, third])].map(candle);
    const result = nextCandleTarget(candles, 0, timeframe, "EURUSD");
    expect(result.complete).toBe(true);
    expect(candles[result.index]!.timestamp).toBe(third - minute);
    const bars = aggregateCandles(candles.slice(0, result.index + 1), "1m", timeframe);
    expect(bars).toEqual(aggregateCandles(candles, "1m", timeframe).slice(0, 2));
  });

  it("requests more data when a loaded chunk ends partway through the next candle", () => {
    const start = Date.UTC(2025, 0, 7, 10);
    const candles = Array.from({length: 40}, (_, i) => candle(start + i * minute));
    expect(nextCandleTarget(candles.slice(0, 22), 14, "15m", "EURUSD")).toEqual({index: 21, complete: false});
    expect(nextCandleTarget(candles, 14, "15m", "EURUSD")).toEqual({index: 29, complete: true});
  });

  it("steps over the closed weekend to the next real candle", () => {
    const candles = [
      candle(Date.UTC(2025, 2, 7, 21, 59)),
      {...candle(Date.UTC(2025, 2, 9, 10)), open: "1.1", high: "1.1", low: "1.1", close: "1.1", volume: "0"},
      candle(Date.UTC(2025, 2, 9, 21)),
      candle(Date.UTC(2025, 2, 9, 21, 14)),
      candle(Date.UTC(2025, 2, 9, 21, 15)),
      candle(Date.UTC(2025, 2, 10, 20, 59)),
      candle(Date.UTC(2025, 2, 10, 21)),
    ];
    expect(nextCandleTarget(candles, 0, "15m", "EURUSD")).toEqual({index: 3, complete: true});
    expect(nextCandleTarget(candles, 0, "1d", "EURUSD")).toEqual({index: 5, complete: true});
  });
});
