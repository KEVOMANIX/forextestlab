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
    expect(chartHistoryKey("session-1:EURUSD", "1M")).toBe("session-1:EURUSD:1M");
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

