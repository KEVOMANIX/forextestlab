import { describe, expect, it, vi } from "vitest";

import { ChartHistoryPageCache, chartHistoryKey, publishChartHistory, subscribeChartHistory } from "./history-cache";
import type { Candle } from "@/lib/market-data/types";

function candle(timestamp: number): Candle {
  return {
    timestamp,
    open: "1",
    high: "2",
    low: "0.5",
    close: "1.5",
    source: "test",
  };
}

describe("completed chart history pages", () => {
  const page = (timestamp = 10) => ({ candles: [candle(timestamp)], hasMore: true });

  it("reuses only the exact session, pair, timeframe and replay boundary", () => {
    const cache = new ChartHistoryPageCache();
    const source = chartHistoryKey("session-1:EURUSD", "15m");
    const result = page();
    cache.set(source, 20, result);
    expect(cache.get(source, 20)).toBe(result);
    expect(cache.get(source, 19)).toBeNull();
    expect(cache.get(source, 21)).toBeNull();
    expect(cache.get(chartHistoryKey("session-1:EURUSD", "1h"), 20)).toBeNull();
    expect(cache.get(chartHistoryKey("session-1:GBPUSD", "15m"), 20)).toBeNull();
    expect(cache.get(chartHistoryKey("session-2:EURUSD", "15m"), 20)).toBeNull();
  });

  it("expires pages even when they are repeatedly read", () => {
    vi.useFakeTimers();
    try {
      const cache = new ChartHistoryPageCache(12, 24_000, 1000);
      cache.set("15m", 20, page());
      vi.advanceTimersByTime(999);
      expect(cache.get("15m", 20)).not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(cache.get("15m", 20)).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("bounds pages by recency and total candles", () => {
    const cache = new ChartHistoryPageCache(2, 3);
    cache.set("15m", 20, page());
    cache.set("1h", 20, page());
    cache.get("15m", 20);
    cache.set("4h", 20, page());
    expect(cache.get("1h", 20)).toBeNull();
    cache.set("1d", 20, { candles: [candle(1), candle(2), candle(3)], hasMore: false });
    expect(cache.get("15m", 20)).toBeNull();
    expect(cache.get("4h", 20)).toBeNull();
    expect(cache.get("1d", 20)?.hasMore).toBe(false);
  });

  it("does not cache empty or oversized responses", () => {
    const cache = new ChartHistoryPageCache(2, 1);
    cache.set("15m", 20, page());
    cache.set("15m", 20, { candles: [], hasMore: false });
    expect(cache.get("15m", 20)).toBeNull();
    cache.set("1h", 20, { candles: [candle(1), candle(2)], hasMore: true });
    expect(cache.get("1h", 20)).toBeNull();
  });
});

describe("shared chart history cache", () => {
  it("keys history by session, symbol, and timeframe", () => {
    expect(chartHistoryKey("session-1:EURUSD", "1M")).toBe("v2:session-1:EURUSD:1M");
  });

  it("never merges UTC-midnight daily cache rows into New York-close history", async () => {
    const storage = `migration-${Date.now()}:EURUSD`;
    const legacyKey = `v2:${storage}:1d`;
    const currentKey = chartHistoryKey(storage, "1d");
    expect(currentKey).not.toBe(legacyKey);
    const midnight = candle(Date.parse("2025-08-04T00:00:00Z"));
    const nyOpen = candle(Date.parse("2025-08-03T21:00:00Z"));
    await publishChartHistory(legacyKey, [midnight], true);
    const listener = vi.fn();
    const stop = subscribeChartHistory(currentKey, listener);
    await publishChartHistory(currentKey, [nyOpen], true);
    expect(listener).toHaveBeenLastCalledWith({ candles: [nyOpen], hasMore: true });
    await publishChartHistory(legacyKey, [midnight], false);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("merges pages and updates every matching chart subscriber", async () => {
    const key = chartHistoryKey(`session-${Date.now()}:EURUSD`, "1d");
    const firstChart = vi.fn();
    const secondChart = vi.fn();
    const stopFirst = subscribeChartHistory(key, firstChart);
    const stopSecond = subscribeChartHistory(key, secondChart);

    await publishChartHistory(key, [candle(20), candle(30)], true);
    await publishChartHistory(key, [candle(10), candle(20)], false);

    expect(firstChart).toHaveBeenLastCalledWith({
      candles: [candle(10), candle(20), candle(30)],
      hasMore: false,
    });
    expect(secondChart).toHaveBeenLastCalledWith({
      candles: [candle(10), candle(20), candle(30)],
      hasMore: false,
    });
    stopFirst();
    stopSecond();
  });
});
