import { describe, expect, it } from "vitest";
import { MAX_TEST_CANDLES, earliestStartWithinLimit, estimateCandles, weekdaysBetween } from "./candle-budget";

const day = (text: string) => Date.parse(`${text}T00:00:00Z`);

describe("Strategy Lab candle budget", () => {
  it("counts weekdays only", () => {
    expect(weekdaysBetween(day("2026-01-05"), day("2026-01-11"))).toBe(5); // Mon–Sun
    expect(weekdaysBetween(day("2026-01-10"), day("2026-01-11"))).toBe(0); // weekend
    expect(weekdaysBetween(day("2026-01-05"), day("2026-02-01"))).toBe(20);
  });

  it("estimates candles per timeframe", () => {
    expect(estimateCandles(day("2026-01-05"), day("2026-01-09"), 900_000)).toBe(5 * 96);
    expect(estimateCandles(day("2026-01-05"), day("2026-01-09"), 3_600_000)).toBe(5 * 24);
    expect(estimateCandles(day("2026-01-05"), day("2026-01-09"), 86_400_000)).toBe(5);
  });

  it("finds the longest period inside the limit", () => {
    const end = day("2026-06-30");
    const start = earliestStartWithinLimit(end, 900_000);
    expect(estimateCandles(start, end, 900_000)).toBeLessThanOrEqual(MAX_TEST_CANDLES);
    expect(estimateCandles(start - 3 * 86_400_000, end, 900_000)).toBeGreaterThan(MAX_TEST_CANDLES);
    expect(earliestStartWithinLimit(end, 900_000, day("2026-06-01"))).toBe(day("2026-06-01"));
  });
});
