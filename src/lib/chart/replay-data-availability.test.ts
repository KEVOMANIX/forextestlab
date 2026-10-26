import { expect, it } from "vitest";
import { hasCandleAtReplayTime } from "./replay-data-availability";

const bars = [{ timestamp: 0 }, { timestamp: 180_000 }];
it("shows unavailable during an internal gap and clears on the next actual candle", () => {
  expect(hasCandleAtReplayTime(bars, 59_999, 60_000)).toBe(true);
  expect(hasCandleAtReplayTime(bars, 60_000, 60_000)).toBe(false);
  expect(hasCandleAtReplayTime(bars, 179_999, 60_000)).toBe(false);
  expect(hasCandleAtReplayTime(bars, 180_000, 60_000)).toBe(true);
});
it("handles empty data, future-only data, exhausted tails and an uninitialized clock", () => {
  expect(hasCandleAtReplayTime([], 0, 60_000)).toBe(false);
  expect(hasCandleAtReplayTime(bars, -1, 60_000)).toBe(false);
  expect(hasCandleAtReplayTime(bars, 240_000, 60_000)).toBe(false);
  expect(hasCandleAtReplayTime(null, null, 60_000)).toBe(true);
});
