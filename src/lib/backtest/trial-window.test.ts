import { describe, expect, it } from "vitest";

import {
  selectTrialWindow,
  TRIAL_SESSION_WINDOW_MS,
} from "./trial-window";

const DAY = 24 * 60 * 60 * 1000;

describe("trial session window selection", () => {
  it("selects a complete 31-day window inside available history", () => {
    const range = { startTime: 10 * DAY, endTime: 100 * DAY };
    const selected = selectTrialWindow([range], () => 0.5);

    expect(selected).not.toBeNull();
    expect(selected!.startTime).toBeGreaterThanOrEqual(range.startTime);
    expect(selected!.endTime).toBeLessThanOrEqual(range.endTime);
    expect(selected!.endTime - selected!.startTime).toBe(
      TRIAL_SESSION_WINDOW_MS,
    );
  });

  it("uses the random value to choose different eligible start dates", () => {
    const ranges = [{ startTime: 0, endTime: 100 * DAY }];
    const first = selectTrialWindow(ranges, () => 0);
    const last = selectTrialWindow(ranges, () => 0.999999);

    expect(first?.startTime).toBe(0);
    expect(last!.startTime).toBeGreaterThan(first!.startTime);
  });

  it("rejects history that cannot contain a full trial period", () => {
    expect(
      selectTrialWindow([{ startTime: 0, endTime: 14 * DAY }], () => 0),
    ).toBeNull();
  });
});
