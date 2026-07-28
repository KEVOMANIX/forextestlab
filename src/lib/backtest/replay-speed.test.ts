import { describe, expect, it } from "vitest";

import {
  replayIntervalMs,
  replayStepsDue,
} from "@/lib/backtest/client";
import {
  DEFAULT_REPLAY_SPEED,
  REPLAY_SPEEDS,
  normalizeReplaySpeed,
} from "@/lib/backtest/types";

describe("real market-time replay speed", () => {
  it("maps 1-minute candles to an honest wall-clock cadence", () => {
    expect(replayIntervalMs(15, "1m")).toBe(4_000);
    expect(replayIntervalMs(60, "1m")).toBe(1_000);
    expect(replayIntervalMs(300, "1m")).toBe(200);
    expect(replayIntervalMs(600, "1m")).toBe(100);
    expect(replayIntervalMs(3600, "1m")).toBeCloseTo(16.67, 2);
    expect(replayIntervalMs(7200, "1m")).toBe(16);
  });

  it("caps selectable replay at two market hours per second", () => {
    expect(REPLAY_SPEEDS.at(-1)).toBe(7200);
    expect(normalizeReplaySpeed(115200)).toBe(7200);
  });

  it("catches up to elapsed market time at fast speeds", () => {
    expect(replayStepsDue(16.67, 3600, "1m")).toBe(1);
    expect(replayStepsDue(16.67, 7200, "1m")).toBe(2);
    expect(replayStepsDue(100, 7200, "1m")).toBe(12);
  });

  it("uses the candle duration when another base timeframe is restored", () => {
    expect(replayIntervalMs(60, "5m")).toBe(5_000);
  });

  it("keeps speed honest for every selectable step size", () => {
    expect(replayIntervalMs(3600, "1m", 1)).toBeCloseTo(16.67, 2);
    expect(replayIntervalMs(3600, "1m", 15)).toBe(250);
    expect(replayIntervalMs(7200, "1m", 60)).toBe(500);
  });

  it("migrates legacy candles-per-second session speeds", () => {
    expect(normalizeReplaySpeed(0.5)).toBe(30);
    expect(normalizeReplaySpeed(1)).toBe(DEFAULT_REPLAY_SPEED);
    expect(normalizeReplaySpeed(5)).toBe(300);
    expect(normalizeReplaySpeed(10)).toBe(600);
  });
});
