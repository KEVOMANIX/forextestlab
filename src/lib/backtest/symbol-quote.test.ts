import { describe, expect, it } from "vitest";

import { symbolQuoteAt } from "./symbol-quote";
import type { Candle } from "@/lib/market-data/types";

function candle(timestamp: number, close: string): Candle {
  return { timestamp, open: close, high: close, low: close, close, source: "test" };
}

const series = [
  candle(1_000, "1.10000"),
  candle(2_000, "1.10500"),
  candle(3_000, "1.10250"),
];

describe("symbolQuoteAt", () => {
  it("quotes the last candle the clock has reached, not the newest one", () => {
    const quote = symbolQuoteAt(series, 2_500);
    expect(quote?.last).toBeCloseTo(1.105, 5);
    expect(quote?.change).toBeCloseTo(0.005, 5);
  });

  it("includes a candle landing exactly on the clock", () => {
    expect(symbolQuoteAt(series, 3_000)?.last).toBeCloseTo(1.1025, 5);
  });

  it("reports a negative change when price fell", () => {
    expect(symbolQuoteAt(series, 3_000)?.change).toBeCloseTo(-0.0025, 5);
  });

  it("has no change on the first revealed candle", () => {
    expect(symbolQuoteAt(series, 1_000)).toEqual({ last: 1.1, change: null });
  });

  it("returns null before the series starts, and with no clock or candles", () => {
    expect(symbolQuoteAt(series, 500)).toBeNull();
    expect(symbolQuoteAt(series, null)).toBeNull();
    expect(symbolQuoteAt([], 3_000)).toBeNull();
  });
});
