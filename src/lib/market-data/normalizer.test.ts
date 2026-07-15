import { describe, it, expect } from "vitest";

import { normalizeRow } from "@/lib/market-data/normalizer";

const OHLC = { open: "1.1000", high: "1.1050", low: "1.0990", close: "1.1020" };

describe("normalizeRow timestamps", () => {
  it("accepts epoch seconds (10 digits)", () => {
    const result = normalizeRow(
      { timestamp: "1700000000", ...OHLC },
      { source: "test" },
    );
    expect(result.error).toBeUndefined();
    expect(result.candle?.timestamp).toBe(1700000000 * 1000);
  });

  it("accepts epoch milliseconds (13 digits)", () => {
    const result = normalizeRow(
      { timestamp: "1700000000000", ...OHLC },
      { source: "test" },
    );
    expect(result.error).toBeUndefined();
    expect(result.candle?.timestamp).toBe(1700000000000);
  });

  it("accepts an ISO-8601 string", () => {
    const result = normalizeRow(
      { timestamp: "2024-01-15T10:30:00Z", ...OHLC },
      { source: "test" },
    );
    expect(result.error).toBeUndefined();
    expect(result.candle?.timestamp).toBe(Date.UTC(2024, 0, 15, 10, 30, 0, 0));
  });

  it("combines date + time as UTC by default", () => {
    const result = normalizeRow(
      { date: "2024-01-15", time: "10:00:00", ...OHLC },
      { source: "test" },
    );
    expect(result.error).toBeUndefined();
    expect(result.candle?.timestamp).toBe(Date.UTC(2024, 0, 15, 10, 0, 0, 0));
  });

  it("applies a fixed offset (wall-clock in +02:00 -> UTC)", () => {
    const result = normalizeRow(
      { date: "2024-01-15", time: "10:00:00", ...OHLC },
      { source: "test", timezone: "+02:00" },
    );
    expect(result.error).toBeUndefined();
    // 10:00 at +02:00 is 08:00 UTC.
    expect(result.candle?.timestamp).toBe(Date.UTC(2024, 0, 15, 8, 0, 0, 0));
  });

  it("applies a negative fixed offset (-05:00 -> UTC)", () => {
    const result = normalizeRow(
      { date: "2024-01-15", time: "10:00:00", ...OHLC },
      { source: "test", timezone: "-05:00" },
    );
    expect(result.error).toBeUndefined();
    // 10:00 at -05:00 is 15:00 UTC.
    expect(result.candle?.timestamp).toBe(Date.UTC(2024, 0, 15, 15, 0, 0, 0));
  });

  it("returns an error for a missing/blank timestamp", () => {
    const result = normalizeRow(
      { timestamp: "  ", ...OHLC },
      { source: "test" },
    );
    expect(result.candle).toBeUndefined();
    expect(result.error).toMatch(/missing timestamp/i);
  });

  it("returns an error for an unparseable date", () => {
    const result = normalizeRow(
      { date: "not-a-date", ...OHLC },
      { source: "test" },
    );
    expect(result.candle).toBeUndefined();
    expect(result.error).toMatch(/unparseable date/i);
  });
});

describe("normalizeRow prices", () => {
  it("returns an error for a non-numeric price", () => {
    const result = normalizeRow(
      { timestamp: "1700000000000", open: "abc", high: "1", low: "1", close: "1" },
      { source: "test" },
    );
    expect(result.candle).toBeUndefined();
    expect(result.error).toMatch(/non-numeric open/i);
  });

  it("keeps original trimmed price strings without reformatting", () => {
    const result = normalizeRow(
      {
        timestamp: "1700000000000",
        open: " 1.10000 ",
        high: "1.10500",
        low: "1.09900",
        close: "1.10200",
      },
      { source: "test" },
    );
    expect(result.candle?.open).toBe("1.10000");
  });

  it("includes bid/ask/volume columns when present and numeric", () => {
    const result = normalizeRow(
      {
        timestamp: "1700000000000",
        ...OHLC,
        volume: "1500",
        bid_open: "1.0999",
        bid_high: "1.1049",
        bid_low: "1.0989",
        bid_close: "1.1019",
        ask_open: "1.1001",
        ask_high: "1.1051",
        ask_low: "1.0991",
        ask_close: "1.1021",
      },
      { source: "test" },
    );
    expect(result.error).toBeUndefined();
    expect(result.candle?.volume).toBe("1500");
    expect(result.candle?.bidOpen).toBe("1.0999");
    expect(result.candle?.bidClose).toBe("1.1019");
    expect(result.candle?.askOpen).toBe("1.1001");
    expect(result.candle?.askClose).toBe("1.1021");
  });

  it("omits bid/ask fields when their columns are absent", () => {
    const result = normalizeRow(
      { timestamp: "1700000000000", ...OHLC },
      { source: "test" },
    );
    expect(result.candle?.bidOpen).toBeUndefined();
    expect(result.candle?.volume).toBeUndefined();
    expect(result.candle?.source).toBe("test");
  });
});
