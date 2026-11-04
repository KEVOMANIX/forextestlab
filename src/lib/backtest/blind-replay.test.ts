import { describe, expect, it } from "vitest";
import { blindDayLabel, blindTickLabel, blindTimeLabel, randomBlindWindow, randomBlindWindowAvailable } from "./blind-replay";

describe("blind replay", () => {
  it("selects only a full window from the available ranges", () => {
    const ranges = [
      { startTime: Date.parse("2024-01-01T05:00:00Z"), endTime: Date.parse("2024-01-02T04:59:00Z") },
      { startTime: Date.parse("2024-02-01T05:00:00Z"), endTime: Date.parse("2024-02-05T04:59:00Z") },
    ];
    expect(randomBlindWindowAvailable(ranges, 3)).toBe(true);
    const first = randomBlindWindow(ranges, 3, () => 0)!;
    const last = randomBlindWindow(ranges, 3, (total) => total - 1)!;
    expect(first.startTime).toBe(Date.parse("2024-02-01T05:00:00Z"));
    expect(last.startTime).toBe(Date.parse("2024-02-02T05:00:00Z"));
    expect(first.endTime).toBeLessThanOrEqual(ranges[1]!.endTime);
    expect(randomBlindWindowAvailable(ranges, 10)).toBe(false);
    expect(randomBlindWindow(ranges, 10, () => 0)).toBeNull();
  });

  it("uses relative New York days across daylight saving changes", () => {
    const start = Date.parse("2024-03-09T05:00:00Z");
    const next = Date.parse("2024-03-10T04:59:00Z");
    const following = Date.parse("2024-03-11T04:00:00Z");
    expect(blindDayLabel(next, start)).toBe("Day 1");
    expect(blindDayLabel(following, start)).toBe("Day 3");
    expect(blindTimeLabel(following, start, "America/New_York")).toMatch(/^Day 3 · 00:00$/);
    expect(blindTickLabel(following, 2, start, "America/New_York")).toBe("Day 3");
  });
});
