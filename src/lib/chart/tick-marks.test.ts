import { describe, expect, it } from "vitest";

import {
  TICK_DAY_OF_MONTH,
  TICK_MONTH,
  TICK_TIME,
  TICK_TIME_WITH_SECONDS,
  TICK_YEAR,
  formatTickMark,
} from "./tick-marks";

const at = Date.UTC(2024, 2, 29, 18, 30, 15); // 29 Mar 2024, 18:30:15 UTC

describe("formatTickMark", () => {
  it("labels an intraday tick as a bare 24-hour time", () => {
    expect(formatTickMark(at, TICK_TIME, "UTC")).toBe("18:30");
  });

  it("labels the tick that opens a day with just the day number", () => {
    expect(formatTickMark(at, TICK_DAY_OF_MONTH, "UTC")).toBe("29");
  });

  it("names the month and the year on their own ticks", () => {
    expect(formatTickMark(at, TICK_MONTH, "UTC")).toBe("Mar");
    expect(formatTickMark(at, TICK_YEAR, "UTC")).toBe("2024");
  });

  it("adds seconds only when the chart asks for them", () => {
    expect(formatTickMark(at, TICK_TIME_WITH_SECONDS, "UTC")).toBe("18:30:15");
  });

  it("reads every label in the chart's zone", () => {
    // 18:30 UTC is 14:30 in New York, still the 29th.
    expect(formatTickMark(at, TICK_TIME, "America/New_York")).toBe("14:30");
    expect(formatTickMark(at, TICK_DAY_OF_MONTH, "America/New_York")).toBe("29");
    // ...and already the 30th in Tokyo.
    expect(formatTickMark(at, TICK_DAY_OF_MONTH, "Asia/Tokyo")).toBe("30");
  });

  it("falls back to a time label for an unknown tick type", () => {
    expect(formatTickMark(at, 99, "UTC")).toBe("18:30");
  });

  it("uses 24-hour time at midnight rather than 12 AM", () => {
    expect(formatTickMark(Date.UTC(2024, 2, 29, 0, 0), TICK_TIME, "UTC")).toBe("00:00");
  });
});
