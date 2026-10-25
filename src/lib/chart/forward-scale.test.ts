import { describe, expect, it } from "vitest";
import { newDisplayCrossesGap } from "./forward-scale";

const time = (hour: number, minute = 0) => Date.UTC(2026, 9, 1, hour, minute) / 1000;
const bars = (...times: number[]) => times.map(time => ({ time }));

describe("forward scale after replay gaps", () => {
  it.each(["1m", "5m", "15m"] as const)("invalidates stale whitespace across an index closure on %s", timeframe => {
    const last = time(20, timeframe === "1m" ? 14 : timeframe === "5m" ? 10 : 0);
    expect(newDisplayCrossesGap(bars(last, time(22)), last, timeframe)).toBe(true);
  });
  it("detects a gap inside a replay batch even when its last pair of bars is contiguous", () => {
    expect(newDisplayCrossesGap(bars(time(20, 10), time(22), time(22, 5)), time(20, 10), "5m")).toBe(true);
  });
  it("retains the cache during normal multi-bar playback", () => {
    expect(newDisplayCrossesGap(bars(time(20), time(20, 5), time(20, 10)), time(20), "5m")).toBe(false);
  });
  it("does not re-invalidate an old closure on every later tick", () => {
    expect(newDisplayCrossesGap(bars(time(20, 10), time(22), time(22, 5)), time(22), "5m")).toBe(false);
  });
  it("retains the cache when only the current candle changes", () => {
    expect(newDisplayCrossesGap(bars(time(20), time(20, 5)), time(20, 5), "5m")).toBe(false);
  });
  it("refreshes forward placeholders after rewinding", () => {
    expect(newDisplayCrossesGap(bars(time(20)), time(22), "5m")).toBe(true);
  });
});
