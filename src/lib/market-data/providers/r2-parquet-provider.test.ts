import { describe, expect, it } from "vitest";

import {
  completedRollupCandles,
  parquetRowsToCandles,
  replaySafeDailyRollup,
  replaySafeForexDailyFragments,
} from "./r2-parquet-provider";

const OHLC = { open: 1, high: 2, low: 0.5, close: 1.5 };
const INSTANT_MS = Date.parse("2024-01-15T10:30:00Z");

describe("New York daily summaries", () => {
  it("rebuilds the current day from revealed minutes instead of its cached full OHLC", () => {
    const start = Date.parse("2025-08-03T21:00:00Z");
    const make = (timestamp: number, high: number) => parquetRowsToCandles([{ timestamp, ...OHLC, high }])[0]!;
    const cutoff = start + 60_000;
    const result = replaySafeForexDailyFragments([make(start, 999)], [make(start, 2), make(cutoff, 3), make(cutoff + 60_000, 999)], start, cutoff);
    expect(result).toHaveLength(1);
    expect(result[0]?.high).toBe("3");
    expect(result[0]?.timestamp).toBe(start);
    expect(replaySafeForexDailyFragments([make(start, 999)], [], start, Date.parse("2025-08-04T21:00:00Z") - 1)[0]?.high).toBe("999");
    // A closed cached day must not be counted again as a partial day.
    expect(replaySafeForexDailyFragments([make(start, 999)], [make(start, 2)], start, Date.parse("2025-08-04T21:00:00Z") - 1)).toHaveLength(1);
  });
});

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

  it("retains the completed-day portion of an open week without leaking later days", () => {
    const monday = Date.UTC(2015, 3, 27);
    const daily = [0, 1, 2, 3, 4].map((offset) => parquetRowsToCandles([{
      timestamp: monday + offset * 24 * 60 * 60_000,
      open: offset + 1,
      high: offset + 2,
      low: offset + 0.5,
      close: offset + 1.5,
    }])[0]!);

    const weekly = replaySafeDailyRollup(daily, "1w", Date.UTC(2015, 3, 30) - 1);

    expect(weekly).toHaveLength(1);
    expect(weekly[0]?.timestamp).toBe(monday);
    expect(weekly[0]?.open).toBe("1");
    expect(weekly[0]?.close).toBe("3.5");
    expect(weekly[0]?.high).toBe("4");
  });
});
