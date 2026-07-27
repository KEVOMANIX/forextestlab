import { describe, expect, it } from "vitest";

import { revealedUpTo } from "./ChartGrid";
import type { Candle } from "@/lib/market-data/types";

/**
 * A chart cell must never draw a candle the replay has not reached, and a cell
 * created mid-session must still show everything revealed before it existed.
 */

const MINUTE = 60_000;
const series: Candle[] = Array.from({ length: 10 }, (_, index) => ({
  timestamp: 1_700_000_000_000 + index * MINUTE,
  open: "1.1000",
  high: "1.1010",
  low: "1.0990",
  close: "1.1005",
  source: "demo",
}));

describe("revealedUpTo", () => {
  it("includes the candle at the clock and nothing after it", () => {
    const revealed = revealedUpTo(series, series[4]!.timestamp);
    expect(revealed).toHaveLength(5);
    expect(revealed.at(-1)).toBe(series[4]);
  });

  it("gives a cell created mid-session the whole revealed history", () => {
    // The bug this guards: a late cell used to get only the opening candles
    // plus whatever arrived after it mounted, leaving a hole in the middle.
    expect(revealedUpTo(series, series[7]!.timestamp)).toHaveLength(8);
  });

  it("reveals nothing before the first candle", () => {
    expect(revealedUpTo(series, series[0]!.timestamp - 1)).toHaveLength(0);
  });

  it("reveals everything once the clock passes the last candle", () => {
    expect(revealedUpTo(series, series.at(-1)!.timestamp + MINUTE)).toHaveLength(10);
  });

  it("handles a clock between two candles", () => {
    expect(revealedUpTo(series, series[3]!.timestamp + 1)).toHaveLength(4);
  });

  it("reveals nothing without a clock, and copes with an empty series", () => {
    expect(revealedUpTo(series, null)).toHaveLength(0);
    expect(revealedUpTo([], 1_700_000_000_000)).toHaveLength(0);
  });

  it("agrees with a linear filter at every clock value", () => {
    for (const candle of series) {
      for (const offset of [-1, 0, 1]) {
        const clock = candle.timestamp + offset;
        expect(revealedUpTo(series, clock)).toEqual(
          series.filter((item) => item.timestamp <= clock),
        );
      }
    }
  });
});
