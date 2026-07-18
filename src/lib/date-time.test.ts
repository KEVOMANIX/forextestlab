import { describe, expect, it } from "vitest";

import {
  formatNewYorkDateTime,
  getNewYorkDateParts,
  getTradingSession,
  newYorkDateEnd,
  newYorkDateStart,
  newYorkMonthKey,
  toNewYorkDateInput,
} from "./date-time";

describe("New York display time", () => {
  it("applies winter and daylight-saving offsets", () => {
    expect(getNewYorkDateParts(Date.UTC(2024, 0, 15, 15)).hour).toBe(10);
    expect(getNewYorkDateParts(Date.UTC(2024, 6, 15, 15)).hour).toBe(11);
  });

  it("formats display values with an ET label", () => {
    expect(formatNewYorkDateTime(Date.UTC(2024, 0, 15, 15))).toContain("10:00 AM ET");
  });

  it("uses New York calendar boundaries and trading sessions", () => {
    const lateSunday = Date.UTC(2024, 0, 8, 1); // Sunday 20:00 ET
    expect(getNewYorkDateParts(lateSunday).weekday).toBe(0);
    expect(newYorkMonthKey(Date.UTC(2024, 1, 1, 2))).toBe("2024-01");
    expect(getTradingSession(lateSunday)).toBe("Asia");
    expect(getTradingSession(Date.UTC(2024, 0, 8, 14))).toBe("New York");
  });

  it("converts selected New York dates to DST-aware UTC boundaries", () => {
    expect(newYorkDateStart("2024-01-15")).toBe(Date.UTC(2024, 0, 15, 5));
    expect(newYorkDateStart("2024-07-15")).toBe(Date.UTC(2024, 6, 15, 4));
    expect(newYorkDateEnd("2024-07-15")).toBe(Date.UTC(2024, 6, 16, 4) - 1);
    expect(toNewYorkDateInput(Date.UTC(2024, 6, 15, 3))).toBe("2024-07-14");
  });
});
