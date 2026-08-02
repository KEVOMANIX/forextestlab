import { describe, it, expect } from "vitest";

import { aggregateCandles, candleBucketStart } from "@/lib/market-data/aggregation";
import type { Candle } from "@/lib/market-data/types";
import { canAggregateTimeframes, nextForexTimeframeTimestamp, TIMEFRAMES, TIMEFRAME_MS } from "@/lib/market-data/types";

describe("forex session timestamps", () => {
  it("compresses the weekend for 4h candles", () => {
    const friday20 = Date.UTC(2025, 7, 1, 20);
    expect(nextForexTimeframeTimestamp(friday20, "4h")).toBe(Date.UTC(2025, 7, 3, 20));
    expect(nextForexTimeframeTimestamp(friday20, "4h", 2)).toBe(Date.UTC(2025, 7, 4, 0));
  });

  it("preserves the Sunday-evening forex reopen", () => {
    const friday21 = Date.UTC(2025, 7, 1, 21);
    expect(nextForexTimeframeTimestamp(friday21, "1h")).toBe(Date.UTC(2025, 7, 3, 21));
  });

  it("daily candles continue from Friday to Monday", () => {
    const friday = Date.UTC(2025, 7, 1);
    expect(nextForexTimeframeTimestamp(friday, "1d")).toBe(Date.UTC(2025, 7, 4));
  });

  it("walks backward across the closure too", () => {
    const monday = Date.UTC(2025, 7, 4);
    expect(nextForexTimeframeTimestamp(monday, "4h", -1)).toBe(Date.UTC(2025, 7, 3, 20));
  });
});

/** UTC midnight of 2024-01-01 — an exact day boundary, so every timeframe aligns. */
const DAY = Date.UTC(2024, 0, 1);

const MIN = TIMEFRAME_MS["1m"];
const HOUR = TIMEFRAME_MS["1h"];

function mk(
  ts: number,
  open: string,
  high: string,
  low: string,
  close: string,
  volume?: string,
): Candle {
  const candle: Candle = {
    timestamp: ts,
    open,
    high,
    low,
    close,
    source: "test",
  };
  if (volume !== undefined) candle.volume = volume;
  return candle;
}

describe("aggregation provenance", () => {
  it("preserves demo provenance when every source candle is demonstration data", () => {
    const candles = [
      { ...mk(DAY, "1", "2", "0.5", "1.5"), source: "demo" },
      { ...mk(DAY + 5 * MIN, "1.5", "2", "1", "1.7"), source: "demo" },
      { ...mk(DAY + 10 * MIN, "1.7", "2.1", "1.4", "2"), source: "demo" },
    ];

    const [aggregated] = aggregateCandles(candles, "5m", "15m");
    expect(aggregated?.source).toBe("demo");
  });
});

describe("candleBucketStart", () => {
  it("floors fixed intraday and daily timeframes to UTC-aligned starts", () => {
    const fixed = TIMEFRAMES.filter((tf) => tf !== "1w" && tf !== "1M" && tf !== "1yr");
    for (const tf of fixed) {
      const size = TIMEFRAME_MS[tf];
      // A timestamp partway through the second bucket of the day.
      const ts = DAY + size + Math.floor(size / 2);
      expect(candleBucketStart(ts, tf)).toBe(DAY + size);
      // Exactly on a boundary maps to itself.
      expect(candleBucketStart(DAY + size, tf)).toBe(DAY + size);
      // The bucket start is always a multiple of the timeframe size.
      expect(candleBucketStart(ts, tf) % size).toBe(0);
    }
  });

  it("uses Monday, calendar-month, and calendar-year boundaries", () => {
    expect(candleBucketStart(Date.UTC(2024, 0, 7, 23, 59), "1w")).toBe(Date.UTC(2024, 0, 1));
    expect(candleBucketStart(Date.UTC(2024, 0, 8), "1w")).toBe(Date.UTC(2024, 0, 8));
    expect(candleBucketStart(Date.UTC(2024, 1, 29, 18), "1M")).toBe(Date.UTC(2024, 1, 1));
    expect(candleBucketStart(Date.UTC(2024, 11, 31, 23), "1yr")).toBe(Date.UTC(2024, 0, 1));
  });

  it("handles the very first bucket of the epoch day", () => {
    expect(candleBucketStart(DAY, "1h")).toBe(DAY);
    expect(candleBucketStart(DAY + 1, "1h")).toBe(DAY);
    expect(candleBucketStart(DAY + HOUR - 1, "1h")).toBe(DAY);
  });
});

describe("aggregateCandles - 1m -> 5m", () => {
  it("aggregates one full 5m bucket from unsorted input", () => {
    const base: Candle[] = [
      mk(DAY + 2 * MIN, "1.14", "1.14", "1.08", "1.09", "5"),
      mk(DAY + 0 * MIN, "1.10", "1.12", "1.09", "1.11", "10"),
      mk(DAY + 4 * MIN, "1.12", "1.16", "1.11", "1.13", "25"),
      mk(DAY + 1 * MIN, "1.11", "1.15", "1.10", "1.14", "20"),
      mk(DAY + 3 * MIN, "1.09", "1.13", "1.07", "1.12", "15"),
    ];

    const out = aggregateCandles(base, "1m", "5m");

    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.timestamp).toBe(DAY);
    expect(c.open).toBe("1.10");
    expect(c.high).toBe("1.16");
    expect(c.low).toBe("1.07");
    expect(c.close).toBe("1.13");
    expect(c.volume).toBe("75");
    expect(c.source).toBe("aggregated");
  });

  it("produces one candle per bucket with no duplicate timestamps", () => {
    const base: Candle[] = [];
    for (let i = 0; i < 10; i++) {
      base.push(mk(DAY + i * MIN, "1.00", "1.00", "1.00", "1.00", "1"));
    }
    const out = aggregateCandles(base, "1m", "5m");
    expect(out).toHaveLength(2);
    const timestamps = out.map((c) => c.timestamp);
    expect(timestamps).toEqual([DAY, DAY + 5 * MIN]);
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it("omits volume when no candle in the bucket has volume", () => {
    const base: Candle[] = [
      mk(DAY, "1.00", "1.01", "0.99", "1.00"),
      mk(DAY + MIN, "1.00", "1.02", "0.98", "1.01"),
    ];
    const out = aggregateCandles(base, "1m", "5m");
    expect(out).toHaveLength(1);
    expect(out[0]?.volume).toBeUndefined();
  });

  it("sums only the volumes that are present", () => {
    const base: Candle[] = [
      mk(DAY, "1.00", "1.01", "0.99", "1.00", "3"),
      mk(DAY + MIN, "1.00", "1.02", "0.98", "1.01"),
      mk(DAY + 2 * MIN, "1.01", "1.03", "0.97", "1.02", "4"),
    ];
    const out = aggregateCandles(base, "1m", "5m");
    expect(out[0]?.volume).toBe("7");
  });
});

describe("aggregateCandles - 5m -> 15m", () => {
  it("aggregates three 5m candles into one 15m candle", () => {
    const step = TIMEFRAME_MS["5m"];
    const base: Candle[] = [
      mk(DAY + 0 * step, "2.00", "2.05", "1.98", "2.03", "100"),
      mk(DAY + 1 * step, "2.03", "2.10", "2.01", "2.08", "200"),
      mk(DAY + 2 * step, "2.08", "2.09", "2.02", "2.04", "150"),
    ];
    const out = aggregateCandles(base, "5m", "15m");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");
    expect(c.timestamp).toBe(DAY);
    expect(c.open).toBe("2.00");
    expect(c.high).toBe("2.1"); // 2.10 normalised by decimal.js
    expect(c.low).toBe("1.98");
    expect(c.close).toBe("2.04");
    expect(c.volume).toBe("450");
  });
});

describe("aggregateCandles - 5m -> 30m", () => {
  it("aggregates six 5m candles into one 30m candle", () => {
    const step = TIMEFRAME_MS["5m"];
    const base: Candle[] = [
      mk(DAY + 0 * step, "3.00", "3.02", "2.99", "3.01", "1"),
      mk(DAY + 1 * step, "3.01", "3.05", "2.98", "3.04", "2"),
      mk(DAY + 2 * step, "3.04", "3.03", "2.95", "2.97", "3"),
      mk(DAY + 3 * step, "2.97", "3.06", "2.96", "3.05", "4"),
      mk(DAY + 4 * step, "3.05", "3.10", "3.00", "3.08", "5"),
      mk(DAY + 5 * step, "3.08", "3.09", "3.01", "3.02", "6"),
    ];
    const out = aggregateCandles(base, "5m", "30m");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");
    expect(c.timestamp).toBe(DAY);
    expect(c.open).toBe("3.00");
    expect(c.high).toBe("3.1"); // max 3.10 normalised
    expect(c.low).toBe("2.95");
    expect(c.close).toBe("3.02");
    expect(c.volume).toBe("21");
  });
});

/**
 * Generate `count` candles at `step` ms spacing using integer-valued prices so
 * the expected OHLCV is exact and easy to reason about:
 *   open  = 500 + i, close = 600 + i (raw strings preserved on output)
 *   high  = 1000 + i (increasing -> max is the last index)
 *   low   = 1000 - i (decreasing -> min is the last index)
 *   volume = i + 1
 */
function genIntCandles(count: number, step: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      mk(
        DAY + i * step,
        String(500 + i),
        String(1000 + i),
        String(1000 - i),
        String(600 + i),
        String(i + 1),
      ),
    );
  }
  return out;
}

function sumOneTo(n: number): number {
  return (n * (n + 1)) / 2;
}

describe("aggregateCandles - larger single-bucket aggregations", () => {
  it.each([
    ["3m", 3],
    ["10m", 10],
    ["45m", 45],
    ["2h", 120],
    ["6h", 360],
    ["12h", 720],
  ] as const)("aggregates 1m -> %s", (timeframe, count) => {
    const out = aggregateCandles(genIntCandles(count, MIN), "1m", timeframe);
    expect(out).toHaveLength(1);
    expect(out[0]?.timestamp).toBe(DAY);
    expect(out[0]?.close).toBe(String(600 + count - 1));
  });

  it("aggregates 1m -> 1h (60 candles)", () => {
    const base = genIntCandles(60, MIN);
    const out = aggregateCandles(base, "1m", "1h");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");
    expect(c.timestamp).toBe(DAY);
    expect(c.open).toBe("500");
    expect(c.close).toBe("659");
    expect(c.high).toBe("1059");
    expect(c.low).toBe("941");
    expect(c.volume).toBe(String(sumOneTo(60)));
  });

  it("aggregates 1h -> 4h (4 candles)", () => {
    const base = genIntCandles(4, HOUR);
    const out = aggregateCandles(base, "1h", "4h");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");
    expect(c.timestamp).toBe(DAY);
    expect(c.open).toBe("500");
    expect(c.close).toBe("603");
    expect(c.high).toBe("1003");
    expect(c.low).toBe("997");
    expect(c.volume).toBe(String(sumOneTo(4)));
  });

  it("aggregates 1h -> 1d (24 candles)", () => {
    const base = genIntCandles(24, HOUR);
    const out = aggregateCandles(base, "1h", "1d");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");
    expect(c.timestamp).toBe(DAY);
    expect(c.open).toBe("500");
    expect(c.close).toBe("623");
    expect(c.high).toBe("1023");
    expect(c.low).toBe("977");
    expect(c.volume).toBe(String(sumOneTo(24)));
  });

  it("aggregates 5m -> 1d (288 candles)", () => {
    const step = TIMEFRAME_MS["5m"];
    const base = genIntCandles(288, step);
    const out = aggregateCandles(base, "5m", "1d");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");
    expect(c.timestamp).toBe(DAY);
    expect(c.open).toBe("500");
    expect(c.close).toBe("887");
    expect(c.high).toBe("1287");
    expect(c.low).toBe("713");
    expect(c.volume).toBe(String(sumOneTo(288)));
  });

  it("aggregates daily candles into calendar weeks, months, and years", () => {
    const daily = [
      mk(Date.UTC(2023, 11, 31), "1", "2", "0", "1", "1"),
      mk(Date.UTC(2024, 0, 1), "2", "3", "1", "2", "1"),
      mk(Date.UTC(2024, 0, 31), "3", "4", "2", "3", "1"),
      mk(Date.UTC(2024, 1, 1), "4", "5", "3", "4", "1"),
    ];
    expect(aggregateCandles(daily, "1d", "1w").map((c) => c.timestamp)).toEqual([
      Date.UTC(2023, 11, 25),
      Date.UTC(2024, 0, 1),
      Date.UTC(2024, 0, 29),
    ]);
    expect(aggregateCandles(daily, "1d", "1M").map((c) => c.timestamp)).toEqual([
      Date.UTC(2023, 11, 1),
      Date.UTC(2024, 0, 1),
      Date.UTC(2024, 1, 1),
    ]);
    expect(aggregateCandles(daily, "1d", "1yr").map((c) => c.timestamp)).toEqual([
      Date.UTC(2023, 0, 1),
      Date.UTC(2024, 0, 1),
    ]);
  });
});

describe("aggregateCandles - determinism", () => {
  it("returns identical output for the same input run twice", () => {
    const base = genIntCandles(120, MIN); // spans two hours
    const first = aggregateCandles(base, "1m", "1h");
    const second = aggregateCandles(base, "1m", "1h");
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.map((c) => c.timestamp)).toEqual([DAY, DAY + HOUR]);
  });

  it("does not mutate the input array", () => {
    const base = genIntCandles(10, MIN);
    const snapshot = base.map((c) => c.timestamp);
    aggregateCandles(base, "1m", "5m");
    expect(base.map((c) => c.timestamp)).toEqual(snapshot);
  });
});

describe("aggregateCandles - bid/ask aggregation", () => {
  it("aggregates bid and ask OHLC when present on every candle", () => {
    const base: Candle[] = [
      {
        timestamp: DAY,
        open: "1.10",
        high: "1.12",
        low: "1.09",
        close: "1.11",
        volume: "5",
        bidOpen: "1.09",
        bidHigh: "1.11",
        bidLow: "1.08",
        bidClose: "1.10",
        askOpen: "1.11",
        askHigh: "1.13",
        askLow: "1.10",
        askClose: "1.12",
        source: "test",
      },
      {
        timestamp: DAY + MIN,
        open: "1.11",
        high: "1.15",
        low: "1.10",
        close: "1.14",
        volume: "7",
        bidOpen: "1.10",
        bidHigh: "1.14",
        bidLow: "1.07",
        bidClose: "1.13",
        askOpen: "1.12",
        askHigh: "1.16",
        askLow: "1.11",
        askClose: "1.15",
        source: "test",
      },
    ];

    const out = aggregateCandles(base, "1m", "5m");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");

    expect(c.bidOpen).toBe("1.09");
    expect(c.bidHigh).toBe("1.14");
    expect(c.bidLow).toBe("1.07");
    expect(c.bidClose).toBe("1.13");

    expect(c.askOpen).toBe("1.11");
    expect(c.askHigh).toBe("1.16");
    expect(c.askLow).toBe("1.1"); // 1.10 normalised by decimal.js
    expect(c.askClose).toBe("1.15");
  });

  it("omits bid/ask when any candle in the bucket lacks them", () => {
    const base: Candle[] = [
      {
        timestamp: DAY,
        open: "1.10",
        high: "1.12",
        low: "1.09",
        close: "1.11",
        bidOpen: "1.09",
        bidHigh: "1.11",
        bidLow: "1.08",
        bidClose: "1.10",
        source: "test",
      },
      // Second candle has no bid fields -> bid must be omitted for the bucket.
      mk(DAY + MIN, "1.11", "1.15", "1.10", "1.14"),
    ];

    const out = aggregateCandles(base, "1m", "5m");
    expect(out).toHaveLength(1);
    const c = out[0];
    if (!c) throw new Error("missing candle");
    expect(c.bidOpen).toBeUndefined();
    expect(c.bidHigh).toBeUndefined();
    expect(c.bidLow).toBeUndefined();
    expect(c.bidClose).toBeUndefined();
    expect(c.askOpen).toBeUndefined();
  });
});

describe("aggregateCandles - invalid timeframe pairs", () => {
  it("throws when the target timeframe is smaller than the source", () => {
    expect(() => aggregateCandles([], "1h", "5m")).toThrow();
    expect(() => aggregateCandles([], "1d", "1h")).toThrow();
    expect(() => aggregateCandles([], "4h", "1h")).toThrow();
  });

  it("does not throw for valid coarser targets", () => {
    expect(() => aggregateCandles([], "4h", "1d")).not.toThrow(); // 24 / 4 = 6
    expect(() => aggregateCandles([], "1m", "1d")).not.toThrow();
    expect(() => aggregateCandles([], "1h", "1h")).not.toThrow();
    expect(() => aggregateCandles([], "1m", "1yr")).not.toThrow();
  });

  it("rejects calendar sources that cross target boundaries", () => {
    expect(canAggregateTimeframes("1w", "1M")).toBe(false);
    expect(canAggregateTimeframes("1w", "1yr")).toBe(false);
    expect(canAggregateTimeframes("1M", "1yr")).toBe(true);
  });

  it("returns an empty array for empty input", () => {
    expect(aggregateCandles([], "1m", "5m")).toEqual([]);
  });
});
