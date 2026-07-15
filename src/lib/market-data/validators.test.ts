import { describe, it, expect } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import {
  dedupeAndSort,
  detectGaps,
  isValidOhlc,
  validateCandle,
} from "@/lib/market-data/validators";

function candle(timestamp: number, overrides: Partial<Candle> = {}): Candle {
  return {
    timestamp,
    open: "1.1000",
    high: "1.1050",
    low: "1.0990",
    close: "1.1020",
    source: "test",
    ...overrides,
  };
}

describe("isValidOhlc", () => {
  it("accepts a valid candle", () => {
    expect(isValidOhlc("1.1000", "1.1050", "1.0990", "1.1020")).toBe(true);
  });

  it("accepts a candle where open equals high and low equals close", () => {
    expect(isValidOhlc("1.1050", "1.1050", "1.0990", "1.0990")).toBe(true);
  });

  it("rejects when high is below the open", () => {
    expect(isValidOhlc("1.1100", "1.1050", "1.0990", "1.1020")).toBe(false);
  });

  it("rejects when low is above the close", () => {
    expect(isValidOhlc("1.1000", "1.1050", "1.1030", "1.1020")).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(isValidOhlc("x", "1.1050", "1.0990", "1.1020")).toBe(false);
  });
});

describe("validateCandle", () => {
  it("accepts a well-formed candle", () => {
    const result = validateCandle(candle(1_700_000_000_000));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a non-numeric price", () => {
    const result = validateCandle(candle(1_700_000_000_000, { close: "abc" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("close"))).toBe(true);
  });

  it("rejects an impossible OHLC relationship", () => {
    const result = validateCandle(
      candle(1_700_000_000_000, { high: "1.0900" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("OHLC"))).toBe(true);
  });

  it("rejects a missing/invalid timestamp", () => {
    const result = validateCandle(candle(0));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("timestamp"))).toBe(true);
  });

  it("rejects a non-numeric bid field when present", () => {
    const result = validateCandle(
      candle(1_700_000_000_000, { bidOpen: "nope" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("bidOpen"))).toBe(true);
  });
});

describe("dedupeAndSort", () => {
  it("sorts ascending and removes duplicates keeping the last occurrence", () => {
    const input = [
      candle(300, { close: "3.0" }),
      candle(100, { close: "1.0" }),
      candle(200, { close: "2.0-first" }),
      candle(200, { close: "2.0-last" }),
      candle(100, { close: "1.0-last" }),
    ];
    const result = dedupeAndSort(input);
    expect(result.duplicates).toBe(2);
    expect(result.candles.map((c) => c.timestamp)).toEqual([100, 200, 300]);
    expect(result.candles[0]?.close).toBe("1.0-last");
    expect(result.candles[1]?.close).toBe("2.0-last");
  });

  it("handles an empty array", () => {
    const result = dedupeAndSort([]);
    expect(result.candles).toEqual([]);
    expect(result.duplicates).toBe(0);
  });
});

describe("detectGaps", () => {
  const FIVE_MIN = 5 * 60_000;

  it("finds a missing interval in a 5m series", () => {
    const base = 1_700_000_000_000;
    // Candles at 0, 1, 2, then skip 3, then 4 (one 5m candle missing).
    const candles = [
      candle(base),
      candle(base + FIVE_MIN),
      candle(base + 2 * FIVE_MIN),
      candle(base + 4 * FIVE_MIN),
    ];
    const report = detectGaps(candles, "5m");
    expect(report.expectedIntervals).toBe(4);
    expect(report.missing).toBe(1);
    expect(report.gaps).toEqual([
      { from: base + 2 * FIVE_MIN, to: base + 4 * FIVE_MIN },
    ]);
  });

  it("reports no gaps for a contiguous series", () => {
    const base = 1_700_000_000_000;
    const candles = [
      candle(base),
      candle(base + FIVE_MIN),
      candle(base + 2 * FIVE_MIN),
    ];
    const report = detectGaps(candles, "5m");
    expect(report.missing).toBe(0);
    expect(report.gaps).toEqual([]);
    expect(report.expectedIntervals).toBe(2);
  });
});
