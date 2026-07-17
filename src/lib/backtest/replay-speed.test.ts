import { describe, expect, it } from "vitest";

import { replayIntervalMs } from "@/lib/backtest/client";
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
  });

  it("uses the candle duration when another base timeframe is restored", () => {
    expect(replayIntervalMs(60, "5m")).toBe(5_000);
  });

  it("migrates legacy candles-per-second session speeds", () => {
    expect(normalizeReplaySpeed(0.5)).toBe(30);
    expect(normalizeReplaySpeed(1)).toBe(DEFAULT_REPLAY_SPEED);
    expect(normalizeReplaySpeed(5)).toBe(300);
    expect(normalizeReplaySpeed(10)).toBe(600);
  });
});
