import { describe, expect, it, vi } from "vitest";

import { chartHistoryKey, publishChartHistory, subscribeChartHistory } from "./history-cache";
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
