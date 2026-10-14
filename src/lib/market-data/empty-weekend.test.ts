import { describe, expect, it } from "vitest";
import { isEmptyForexWeekendCandle } from "./empty-weekend";
import type { Candle } from "./types";

const candle = (time: string, overrides: Partial<Candle> = {}): Candle => ({ timestamp: Date.parse(time), open: "1.15772", high: "1.15772", low: "1.15772", close: "1.15772", volume: "0", source: "dukascopy-r2", ...overrides });
describe("empty forex weekend source bars", () => {
  it("removes the reported Sunday placeholders, respecting summer and winter opens", () => {
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-08-30T00:00Z"))).toBe(true);
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-08-30T20:59Z"))).toBe(true);
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-08-30T21:00Z"))).toBe(false);
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-01-11T21:59Z"))).toBe(true);
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-01-11T22:00Z"))).toBe(false);
  });
  it("retains real quotes, weekday dojis and cryptocurrency weekends", () => {
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-08-31T12:00Z"))).toBe(false);
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-08-30T12:00Z", { volume: "1" }))).toBe(false);
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-08-30T12:00Z", { high: "1.16" }))).toBe(false);
    expect(isEmptyForexWeekendCandle("EURUSD", candle("2026-08-30T12:00Z", { volume: undefined }))).toBe(false);
    expect(isEmptyForexWeekendCandle("BTCUSD", candle("2026-08-30T12:00Z"))).toBe(false);
  });
});
