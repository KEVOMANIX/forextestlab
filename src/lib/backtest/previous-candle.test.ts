import { describe, expect, it } from "vitest";
import { aggregateCandles, candleBucketStart } from "@/lib/market-data/aggregation";
import { TIMEFRAMES, nextTimeframeTimestamp, type Candle } from "@/lib/market-data/types";
import { previousCandleIndex } from "./previous-candle";

const minute = 60_000;
const candle = (timestamp: number, n = 0): Candle => ({
  timestamp, open: "1.1", high: "1.3", low: "1.0",
  close: String(1.1 + n / 1000), volume: "10", source: "aggregated",
});

describe("previous displayed candle", () => {
  it.each(TIMEFRAMES)("removes exactly one %s bar and preserves the previous OHLC", (timeframe) => {
    const start = candleBucketStart(Date.UTC(2025, 0, 7, 12), timeframe);
    const next = nextTimeframeTimestamp(start, timeframe);
    const third = nextTimeframeTimestamp(next, timeframe);
    const times = [...new Set([start, next - minute, next, third - minute, third, third + minute])].sort((a, b) => a - b);
    const candles = times.map(candle);
    const before = aggregateCandles(candles, "1m", timeframe);
    const target = previousCandleIndex(candles, candles.length - 1, timeframe, "EURUSD")!;
    const after = aggregateCandles(candles.slice(0, target + 1), "1m", timeframe);
    expect(after).toEqual(before.slice(0, -1));
    const secondTarget = previousCandleIndex(candles, target, timeframe, "EURUSD")!;
    expect(aggregateCandles(candles.slice(0, secondTarget + 1), "1m", timeframe)).toEqual(before.slice(0, -2));
  });

  it("uses the selected timeframe instead of the session's one-minute base", () => {
    const start = Date.UTC(2025, 0, 7, 10);
    const candles = Array.from({ length: 49 }, (_, i) => candle(start + i * minute, i));
    expect(previousCandleIndex(candles, 48, "1m", "EURUSD")).toBe(47);
    expect(previousCandleIndex(candles, 48, "5m", "EURUSD")).toBe(44);
    expect(previousCandleIndex(candles, 48, "15m", "EURUSD")).toBe(44);
    expect(previousCandleIndex(candles, 48, "30m", "EURUSD")).toBe(29);
  });

  it("stops on Friday's close over a weekend and daylight-saving change", () => {
    const candles = [
      candle(Date.UTC(2025, 2, 7, 21, 59)),
      { ...candle(Date.UTC(2025, 2, 9, 10)), open: "1.1", high: "1.1", low: "1.1", close: "1.1", volume: "0" },
      candle(Date.UTC(2025, 2, 9, 21)),
      candle(Date.UTC(2025, 2, 10, 12)),
    ];
    expect(previousCandleIndex(candles, 3, "1d", "EURUSD")).toBe(0);
    expect(previousCandleIndex(candles, 2, "15m", "EURUSD")).toBe(0);
  });

  it("stops at the loaded boundary and does not use unrevealed candles", () => {
    const start = Date.UTC(2025, 0, 7, 10);
    const candles = Array.from({ length: 90 }, (_, i) => candle(start + i * minute, i));
    expect(previousCandleIndex(candles, 0, "15m", "EURUSD")).toBeNull();
    expect(previousCandleIndex(candles, 14, "15m", "EURUSD")).toBeNull();
    expect(previousCandleIndex(candles, 30, "15m", "EURUSD")).toBe(29);
    expect(previousCandleIndex([], 0, "15m", "EURUSD")).toBeNull();
  });
});
