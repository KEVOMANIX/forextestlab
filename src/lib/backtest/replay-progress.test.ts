import { describe, expect, it } from "vitest";

import { replayDayLabel, replayDayProgress } from "./replay-progress";

/** New York, so the day boundary is the one the rest of the app reports in. */
const MARCH_3 = Date.parse("2024-03-03T12:00:00Z");
const MARCH_6 = Date.parse("2024-03-06T12:00:00Z");

describe("replay day progress", () => {
  it("counts the session's calendar days inclusively", () => {
    expect(
      replayDayProgress({
        startTime: MARCH_3,
        endTime: MARCH_6,
        currentTime: MARCH_3,
      }),
    ).toEqual({ day: 1, totalDays: 4 });
  });

  it("advances a day when the replay crosses New York midnight", () => {
    expect(
      replayDayProgress({
        startTime: MARCH_3,
        endTime: MARCH_6,
        currentTime: Date.parse("2024-03-05T09:30:00Z"),
      }).day,
    ).toBe(3);
  });

  it("treats a session inside one New York day as a single day", () => {
    // 09:00–20:00 ET, deliberately away from either UTC boundary: a range
    // written in UTC hours would silently span two New York dates.
    expect(
      replayDayProgress({
        startTime: Date.parse("2024-03-03T14:00:00Z"),
        endTime: Date.parse("2024-03-04T01:00:00Z"),
        currentTime: Date.parse("2024-03-03T18:00:00Z"),
      }),
    ).toEqual({ day: 1, totalDays: 1 });
  });

  it("clamps a cursor outside the range instead of reporting day 0 or day 99", () => {
    expect(
      replayDayProgress({
        startTime: MARCH_3,
        endTime: MARCH_6,
        currentTime: Date.parse("2020-01-01T00:00:00Z"),
      }).day,
    ).toBe(1);
    expect(
      replayDayProgress({
        startTime: MARCH_3,
        endTime: MARCH_6,
        currentTime: Date.parse("2030-01-01T00:00:00Z"),
      }).day,
    ).toBe(4);
  });

  it("reports day 1 before the replay has revealed anything", () => {
    expect(
      replayDayProgress({ startTime: MARCH_3, endTime: MARCH_6, currentTime: null }),
    ).toEqual({ day: 1, totalDays: 4 });
  });

  it("labels progress in days, with thousands grouped", () => {
    expect(
      replayDayLabel({ startTime: MARCH_3, endTime: MARCH_6, currentTime: MARCH_6 }),
    ).toBe("Day 4 of 4");
    expect(
      replayDayLabel({
        startTime: Date.parse("2015-01-01T12:00:00Z"),
        endTime: Date.parse("2026-01-01T12:00:00Z"),
        currentTime: Date.parse("2015-01-02T12:00:00Z"),
      }),
    ).toBe("Day 2 of 4,019");
  });
});
