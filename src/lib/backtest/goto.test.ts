import { describe, expect, it } from "vitest";

import {
  nextCalendarBoundary,
  nextSessionEdge,
  previousDailyRange,
  previousSessionRange,
  psychologicalLevels,
  reachableMoments,
  tradingSession,
  zoneParts,
  zoneWallClockToUtc,
} from "./goto";
import type { Candle } from "@/lib/market-data/types";

function candle(timestamp: number, high: number, low: number): Candle {
  return {
    timestamp,
    open: String(low),
    high: String(high),
    low: String(low),
    close: String(high),
    source: "test",
  };
}

/** Minute-spaced candles covering [start, end). */
function series(start: number, end: number, high: number, low: number): Candle[] {
  const out: Candle[] = [];
  for (let time = start; time < end; time += 3_600_000) out.push(candle(time, high, low));
  return out;
}

const LONDON = tradingSession("london")!;
const NEW_YORK = tradingSession("new-york")!;

describe("zoneWallClockToUtc", () => {
  it("resolves a winter New York wall clock at UTC-5", () => {
    // 2024-01-10 08:00 New York = 13:00 UTC.
    expect(zoneWallClockToUtc("America/New_York", 2024, 1, 10, 8, 0)).toBe(
      Date.UTC(2024, 0, 10, 13, 0),
    );
  });

  it("resolves a summer New York wall clock at UTC-4", () => {
    // 2024-07-10 08:00 New York = 12:00 UTC.
    expect(zoneWallClockToUtc("America/New_York", 2024, 7, 10, 8, 0)).toBe(
      Date.UTC(2024, 6, 10, 12, 0),
    );
  });

  it("resolves the hour after a spring-forward transition", () => {
    // 2024-03-10 03:00 New York is the first hour after the clocks moved.
    expect(zoneWallClockToUtc("America/New_York", 2024, 3, 10, 3, 0)).toBe(
      Date.UTC(2024, 2, 10, 7, 0),
    );
  });

  it("round-trips through zoneParts", () => {
    const at = zoneWallClockToUtc("Asia/Tokyo", 2024, 5, 2, 9, 30);
    expect(zoneParts(at, "Asia/Tokyo")).toMatchObject({
      year: 2024,
      month: 5,
      day: 2,
      hour: 9,
      minute: 30,
    });
  });
});

describe("nextCalendarBoundary", () => {
  it("returns the next local midnight for a day", () => {
    const from = Date.UTC(2024, 0, 10, 20, 0); // 15:00 New York
    expect(nextCalendarBoundary(from, "America/New_York", "day")).toBe(
      Date.UTC(2024, 0, 11, 5, 0),
    );
  });

  it("returns the coming Monday for a week", () => {
    // Wednesday 2024-01-10.
    const from = Date.UTC(2024, 0, 10, 20, 0);
    const monday = nextCalendarBoundary(from, "America/New_York", "week");
    expect(zoneParts(monday, "America/New_York")).toMatchObject({
      year: 2024,
      month: 1,
      day: 15,
      weekday: 1,
      hour: 0,
    });
  });

  it("moves a Sunday to the very next day, not a week later", () => {
    // Sunday 2024-01-14, 20:00 New York.
    const from = Date.UTC(2024, 0, 15, 1, 0);
    const monday = nextCalendarBoundary(from, "America/New_York", "week");
    expect(zoneParts(monday, "America/New_York")).toMatchObject({
      day: 15,
      weekday: 1,
    });
  });

  it("returns the first of next month, rolling the year", () => {
    const from = Date.UTC(2024, 11, 20, 12, 0);
    const next = nextCalendarBoundary(from, "UTC", "month");
    expect(next).toBe(Date.UTC(2025, 0, 1));
  });
});

describe("nextSessionEdge", () => {
  it("finds today's open when the clock is still before it", () => {
    // 2024-01-10 06:00 UTC is before London's 08:00 open (08:00 GMT in winter).
    const from = Date.UTC(2024, 0, 10, 6, 0);
    expect(nextSessionEdge(from, LONDON, "open")).toBe(Date.UTC(2024, 0, 10, 8, 0));
  });

  it("rolls to tomorrow once the open has passed", () => {
    const from = Date.UTC(2024, 0, 10, 9, 0);
    expect(nextSessionEdge(from, LONDON, "open")).toBe(Date.UTC(2024, 0, 11, 8, 0));
  });

  it("skips the weekend", () => {
    // Friday 2024-01-12, after the London open.
    const from = Date.UTC(2024, 0, 12, 9, 0);
    expect(nextSessionEdge(from, LONDON, "open")).toBe(Date.UTC(2024, 0, 15, 8, 0));
  });

  it("finds the close as a distinct edge", () => {
    const from = Date.UTC(2024, 0, 10, 9, 0);
    expect(nextSessionEdge(from, LONDON, "close")).toBe(
      Date.UTC(2024, 0, 10, 16, 30),
    );
  });

  it("tracks summer time rather than a fixed offset", () => {
    // 2024-07-10: New York is UTC-4, so an 08:00 open is 12:00 UTC.
    const from = Date.UTC(2024, 6, 10, 6, 0);
    expect(nextSessionEdge(from, NEW_YORK, "open")).toBe(
      Date.UTC(2024, 6, 10, 12, 0),
    );
  });
});

describe("previousSessionRange", () => {
  it("uses the last completed session, not the one in progress", () => {
    const yesterday = series(Date.UTC(2024, 0, 9, 8, 0), Date.UTC(2024, 0, 9, 16, 0), 1.1, 1.0);
    const today = series(Date.UTC(2024, 0, 10, 8, 0), Date.UTC(2024, 0, 10, 12, 0), 1.5, 0.5);
    const now = Date.UTC(2024, 0, 10, 12, 0);
    expect(previousSessionRange([...yesterday, ...today], LONDON, now)).toMatchObject({
      high: 1.1,
      low: 1.0,
    });
  });

  it("walks back over a weekend", () => {
    const friday = series(Date.UTC(2024, 0, 12, 8, 0), Date.UTC(2024, 0, 12, 16, 0), 1.2, 1.1);
    // Monday morning, before the London open.
    const now = Date.UTC(2024, 0, 15, 7, 0);
    expect(previousSessionRange(friday, LONDON, now)).toMatchObject({
      high: 1.2,
      low: 1.1,
    });
  });

  it("returns null when no revealed candle falls in any session window", () => {
    const now = Date.UTC(2024, 0, 10, 12, 0);
    expect(previousSessionRange([], LONDON, now)).toBeNull();
  });
});

describe("previousDailyRange", () => {
  it("excludes the day in progress", () => {
    const zone = "UTC";
    const yesterday = series(Date.UTC(2024, 0, 9), Date.UTC(2024, 0, 10), 1.3, 1.2);
    const today = series(Date.UTC(2024, 0, 10), Date.UTC(2024, 0, 10, 12), 9, 0.1);
    const now = Date.UTC(2024, 0, 10, 12);
    expect(previousDailyRange([...yesterday, ...today], zone, now)).toMatchObject({
      high: 1.3,
      low: 1.2,
    });
  });
});

describe("reachableMoments", () => {
  it("offers only moments ahead of the replay and inside the session", () => {
    const from = Date.UTC(2020, 0, 1);
    const endTime = Date.UTC(2020, 11, 31);
    const reachable = reachableMoments(from, endTime, "UTC");
    expect(reachable.map((entry) => entry.moment.id)).toEqual(["covid-crash"]);
    expect(reachable[0]!.timestamp).toBe(Date.UTC(2020, 2, 12));
  });

  it("excludes a moment the replay has already passed", () => {
    const from = Date.UTC(2020, 5, 1);
    const endTime = Date.UTC(2020, 11, 31);
    expect(reachableMoments(from, endTime, "UTC")).toEqual([]);
  });

  it("resolves the date in the chart's zone", () => {
    const from = Date.UTC(2022, 0, 1);
    const endTime = Date.UTC(2022, 11, 31);
    const [entry] = reachableMoments(from, endTime, "America/New_York");
    // 2022-02-24 00:00 New York is 05:00 UTC that day.
    expect(entry!.moment.id).toBe("ukraine");
    expect(entry!.timestamp).toBe(Date.UTC(2022, 1, 24, 5));
  });

  it("returns them oldest first", () => {
    const reachable = reachableMoments(
      Date.UTC(2008, 0, 1),
      Date.UTC(2025, 0, 1),
      "UTC",
    );
    const times = reachable.map((entry) => entry.timestamp);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(reachable.length).toBeGreaterThan(5);
  });
});

describe("psychologicalLevels", () => {
  it("returns round 50-pip levels around a 5-decimal price", () => {
    expect(psychologicalLevels(1.08661, 0.0001, 2)).toEqual([
      1.075, 1.08, 1.085, 1.09, 1.095,
    ]);
  });

  it("scales with the pip size of a JPY cross", () => {
    expect(psychologicalLevels(157.42, 0.01, 1)).toEqual([157, 157.5, 158]);
  });

  it("ignores an unusable pip size", () => {
    expect(psychologicalLevels(1.1, 0)).toEqual([]);
  });
});
