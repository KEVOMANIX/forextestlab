import { describe, expect, it } from "vitest";

import {
  opensIntervalInput,
  parseIntervalInput,
  timeframeMinutes,
} from "./interval-input";
import type { Timeframe } from "@/lib/market-data/types";

const AVAILABLE: Timeframe[] = [
  "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M", "3M", "1yr",
];

describe("timeframe duration", () => {
  it("reads every code, including the two-letter year", () => {
    expect(timeframeMinutes("1m")).toBe(1);
    expect(timeframeMinutes("1h")).toBe(60);
    expect(timeframeMinutes("1d")).toBe(1440);
    expect(timeframeMinutes("1w")).toBe(10080);
    expect(timeframeMinutes("1yr")).toBe(525600);
  });
});

describe("typed intervals", () => {
  it("treats a bare number as minutes", () => {
    expect(parseIntervalInput("5", AVAILABLE)).toEqual({
      timeframe: "5m",
      label: "5 minutes",
    });
  });

  it("matches on duration, so 60 is the hourly chart", () => {
    expect(parseIntervalInput("60", AVAILABLE).timeframe).toBe("1h");
    expect(parseIntervalInput("240", AVAILABLE).timeframe).toBe("4h");
    expect(parseIntervalInput("1440", AVAILABLE).timeframe).toBe("1d");
  });

  it("separates minutes from months by case, as the codes do", () => {
    expect(parseIntervalInput("1m", AVAILABLE).timeframe).toBe("1m");
    expect(parseIntervalInput("1M", AVAILABLE).timeframe).toBe("1M");
    expect(parseIntervalInput("3M", AVAILABLE).label).toBe("3 months");
  });

  it("accepts the other units in either case", () => {
    expect(parseIntervalInput("4h", AVAILABLE).timeframe).toBe("4h");
    expect(parseIntervalInput("4H", AVAILABLE).timeframe).toBe("4h");
    expect(parseIntervalInput("1D", AVAILABLE).timeframe).toBe("1d");
    expect(parseIntervalInput("1W", AVAILABLE).timeframe).toBe("1w");
    expect(parseIntervalInput("1yr", AVAILABLE).timeframe).toBe("1yr");
  });

  it("reads a bare unit letter as one of that unit", () => {
    expect(parseIntervalInput("d", AVAILABLE)).toEqual({
      timeframe: "1d",
      label: "1 day",
    });
  });

  it("says so when the interval parses but is not offered", () => {
    const guess = parseIntervalInput("7", AVAILABLE);
    expect(guess.timeframe).toBeNull();
    expect(guess.label).toBe("7 minutes — not available");
  });

  it("rejects nonsense and zero without pretending to understand it", () => {
    expect(parseIntervalInput("0", AVAILABLE).timeframe).toBeNull();
    expect(parseIntervalInput("abc", AVAILABLE).timeframe).toBeNull();
    expect(parseIntervalInput("5x", AVAILABLE).timeframe).toBeNull();
    expect(parseIntervalInput("", AVAILABLE)).toEqual({ timeframe: null, label: "" });
  });
});

describe("what opens the field", () => {
  const event = (over: Partial<Parameters<typeof opensIntervalInput>[0]>) => ({
    key: "5",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...over,
  });

  it("opens on a plain digit", () => {
    expect(opensIntervalInput(event({}))).toBe(true);
  });

  it("stays shut for modifiers and for letters", () => {
    expect(opensIntervalInput(event({ ctrlKey: true }))).toBe(false);
    expect(opensIntervalInput(event({ metaKey: true }))).toBe(false);
    expect(opensIntervalInput(event({ altKey: true }))).toBe(false);
    expect(opensIntervalInput(event({ key: "d" }))).toBe(false);
    expect(opensIntervalInput(event({ key: "Enter" }))).toBe(false);
  });
});
