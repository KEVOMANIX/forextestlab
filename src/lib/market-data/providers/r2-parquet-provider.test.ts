import { describe, expect, it } from "vitest";

import { completedRollupCandles, parquetRowsToCandles } from "./r2-parquet-provider";

const OHLC = { open: 1, high: 2, low: 0.5, close: 1.5 };
const INSTANT_MS = Date.parse("2024-01-15T10:30:00Z");

describe("parquetRowsToCandles timestamp conversion", () => {
  it.each([
    ["seconds", INSTANT_MS / 1000],
    ["milliseconds", INSTANT_MS],
    ["microseconds", INSTANT_MS * 1000],
    ["nanoseconds", BigInt(INSTANT_MS) * 1_000_000n],
  ])("normalizes %s to UTC epoch milliseconds", (_label, timestamp) => {
    const [candle] = parquetRowsToCandles([{ timestamp, ...OHLC }]);
    expect(candle?.timestamp).toBe(INSTANT_MS);
  });

  it("parses numeric timestamp strings without using the host timezone", () => {
    const [candle] = parquetRowsToCandles([
      { timestamp: String(INSTANT_MS * 1000), ...OHLC },
    ]);
    expect(candle?.timestamp).toBe(INSTANT_MS);
  });
});

describe("completed higher-timeframe rollups", () => {
  it("does not expose the full daily candle while that replay day is open", () => {
    const day = Date.UTC(2015, 3, 29);
    const candle = parquetRowsToCandles([{ timestamp: day, ...OHLC }])[0]!;
    expect(completedRollupCandles([candle], "1d", day + 3 * 60 * 60_000)).toEqual([]);
    expect(completedRollupCandles([candle], "1d", day + 24 * 60 * 60_000 - 1)).toEqual([candle]);
  });

  it("does not expose a weekly rollup until the week has closed", () => {
    const monday = Date.UTC(2015, 3, 27);
    const candle = parquetRowsToCandles([{ timestamp: monday, ...OHLC }])[0]!;
    expect(completedRollupCandles([candle], "1w", Date.UTC(2015, 3, 29))).toEqual([]);
    expect(completedRollupCandles([candle], "1w", Date.UTC(2015, 4, 4) - 1)).toEqual([candle]);
  });
});
