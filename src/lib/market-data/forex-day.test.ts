import { describe, expect, it } from "vitest";
import { aggregateCandles, candleBucketStart } from "./aggregation";
import { forexDailyLabelDate, forexDailyStart, nextForexDailyBoundary } from "./forex-day";
import { nextForexTimeframeTimestamp, type Candle } from "./types";
import { formatCrosshairLabel, formatTickMark, TICK_DAY_OF_MONTH } from "../chart/tick-marks";

const hour = 3_600_000;
const bar = (timestamp: number, value: number): Candle => ({ timestamp, open: String(value), high: String(value + 1), low: String(value - 1), close: String(value), volume: "1", source: "test" });

describe("New York-close daily candles", () => {
  it.each([
    ["summer", "2025-08-03T21:00:00Z", "2025-08-04T21:00:00Z"],
    ["winter", "2025-01-05T22:00:00Z", "2025-01-06T22:00:00Z"],
  ])("keeps Sunday opening prices in Monday in %s", (_season, open, close) => {
    const start = Date.parse(open);
    const candles = Array.from({ length: 24 }, (_, i) => bar(start + i * hour, i + 1));
    const daily = aggregateCandles(candles, "1h", "1d");
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ timestamp: start, open: "1", close: "24", high: "25", low: "0", volume: "24" });
    expect(nextForexDailyBoundary(start)).toBe(Date.parse(close));
    expect(forexDailyStart(Date.parse(close) - 1)).toBe(start);
    expect(forexDailyStart(Date.parse(close))).toBe(Date.parse(close));
    for (const zone of ["Etc/GMT-3", "Etc/GMT+5"]) {
      expect(formatCrosshairLabel(start, zone, 24 * hour)).toContain("Mon");
      expect(formatTickMark(start, TICK_DAY_OF_MONTH, zone, "1d")).toBe(_season === "summer" ? "Aug 04" : "Jan 06");
    }
  });

  it("produces five weekday candles and preserves all 120 trading hours", () => {
    const start = Date.parse("2025-08-03T21:00:00Z");
    const daily = aggregateCandles(Array.from({ length: 120 }, (_, i) => bar(start + i * hour, i)), "1h", "1d");
    expect(daily.map(c => new Date(forexDailyLabelDate(c.timestamp)).getUTCDay())).toEqual([1, 2, 3, 4, 5]);
    expect(daily.reduce((sum, c) => sum + Number(c.volume), 0)).toBe(120);
    expect(daily.at(-1)?.close).toBe("119");
  });

  it.each([
    ["2025-03-07T22:00:00Z", "2025-03-09T21:00:00Z"],
    ["2025-10-31T21:00:00Z", "2025-11-02T22:00:00Z"],
  ])("moves the daily runway across a DST weekend from %s", (fridayClose, sundayOpen) => {
    const fridayOpen = forexDailyStart(Date.parse(fridayClose) - 1);
    expect(nextForexTimeframeTimestamp(fridayOpen, "1d")).toBe(Date.parse(sundayOpen));
    expect(nextForexTimeframeTimestamp(Date.parse(sundayOpen), "1d", -1)).toBe(fridayOpen);
  });

  it("keeps the candle opening timestamp behind the replay clock", () => {
    const cutoff = Date.parse("2025-08-03T21:03:00Z");
    const start = candleBucketStart(cutoff, "1d");
    expect(start).toBe(Date.parse("2025-08-03T21:00:00Z"));
    expect(start).toBeLessThanOrEqual(cutoff);
  });

  it("joins a Monday candle split between August and September source files", () => {
    const start = Date.parse("2025-08-31T21:00:00Z");
    const minutes = Array.from({ length: 24 }, (_, i) => bar(start + i * hour, i + 1));
    const august = aggregateCandles(minutes.slice(0, 3), "1h", "1d");
    const september = aggregateCandles(minutes.slice(3), "1h", "1d");
    const daily = aggregateCandles([...august, ...september], "1d", "1d");
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ timestamp: start, open: "1", close: "24", volume: "24" });
    expect(forexDailyLabelDate(start)).toBe(Date.parse("2025-09-01T00:00:00Z"));
  });

  it("leaves intraday Sunday candles and legacy UTC rollups intact", () => {
    const sunday = Date.parse("2025-08-03T21:00:00Z");
    expect(aggregateCandles([bar(sunday, 1)], "1h", "1h")[0]?.timestamp).toBe(sunday);
    expect(aggregateCandles([bar(sunday, 1)], "1h", "1d", "utc")[0]?.timestamp).toBe(Date.parse("2025-08-03T00:00:00Z"));
  });
});
