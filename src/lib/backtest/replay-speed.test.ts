import { describe, expect, it } from "vitest";

import {
  replayBatchSize,
  replayIntervalMs,
  replayStepsDue,
} from "@/lib/backtest/client";
import {
  DEFAULT_REPLAY_SPEED,
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
    expect(replayIntervalMs(28800, "1m")).toBe(16);
  });

  it("batches ultra-fast replay speeds beyond the browser timer floor", () => {
    expect(replayBatchSize(3600, "1m")).toBe(1);
    expect(replayBatchSize(7200, "1m")).toBe(2);
    expect(replayBatchSize(14400, "1m")).toBe(4);
    expect(replayBatchSize(28800, "1m")).toBe(8);
    expect(replayBatchSize(28800, "1m", 15)).toBe(1);
  });

  it("advances every step owed within a high-speed animation frame", () => {
    expect(replayStepsDue(16.67, 3600, "1m")).toBe(1);
    expect(replayStepsDue(16.67, 28800, "1m")).toBe(8);
    expect(replayStepsDue(16.67, 115200, "1m")).toBe(32);
    expect(replayStepsDue(100, 115200, "1m")).toBe(64);
  });

  it("uses the candle duration when another base timeframe is restored", () => {
    expect(replayIntervalMs(60, "5m")).toBe(5_000);
  });

  it("preserves real market-time speed for multi-candle replay steps", () => {
    expect(replayIntervalMs(60, "1m", 5)).toBe(5_000);
    expect(replayIntervalMs(600, "1m", 15)).toBe(1_500);
    expect(replayIntervalMs(7200, "1m", 15)).toBe(125);
  });

  it("forms a 15-minute step in one second at 15m/s", () => {
    expect(replayIntervalMs(900, "1m", 15)).toBe(1_000);
    expect(replayIntervalMs(900, "15m", 1)).toBe(1_000);
  });

  it("migrates legacy candles-per-second session speeds", () => {
    expect(normalizeReplaySpeed(0.5)).toBe(30);
    expect(normalizeReplaySpeed(1)).toBe(DEFAULT_REPLAY_SPEED);
    expect(normalizeReplaySpeed(5)).toBe(300);
    expect(normalizeReplaySpeed(10)).toBe(600);
  });
});
