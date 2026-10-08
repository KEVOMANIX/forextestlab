import { describe, expect, it } from "vitest";
import { historyBeforeReplay, mergeOpeningHistoryBucket } from "./opening-history";
import type { Candle } from "@/lib/market-data/types";
import type { OHLCV } from "./indicators";

const time = Date.parse("2025-08-03T21:00:00Z") / 1000;
const prior: Candle = { timestamp: time * 1000, open: "1.10", high: "1.15", low: "1.08", close: "1.12", volume: "20", source: "aggregated" };
const revealed: OHLCV = { time, open: 1.12, high: 1.13, low: 1.11, close: 1.125, volume: 5 };

describe("first daily candle at the history/replay join", () => {
  it("does not paint the partial history body beneath the merged daily candle", () => {
    const earlier = { ...prior, timestamp: prior.timestamp - 86400_000 };
    expect(historyBeforeReplay([earlier, prior], [revealed])).toEqual([earlier]);
    expect(historyBeforeReplay([earlier, prior], [])).toEqual([earlier, prior]);
  });
  it("uses the session open and extremes, while keeping the latest revealed close", () => {
    const result = mergeOpeningHistoryBucket([prior], [revealed]);
    expect(result[0]).toEqual({ time, open: 1.10, high: 1.15, low: 1.08, close: 1.125, volume: 25 });
    expect(revealed.open).toBe(1.12);
    expect(prior.close).toBe("1.12");
  });

  it("keeps later candles unchanged and never applies another day's open", () => {
    const next = { ...revealed, time: time + 86400 };
    expect(mergeOpeningHistoryBucket([prior], [revealed, next])[1]).toBe(next);
    const replay = [next];
    expect(mergeOpeningHistoryBucket([prior], replay)).toBe(replay);
  });

  it("does not double-count history when the partial replay candle updates", () => {
    const first = mergeOpeningHistoryBucket([prior], [revealed]);
    const second = mergeOpeningHistoryBucket([prior], [{ ...revealed, close: 1.13, volume: 6 }]);
    expect(first[0]?.volume).toBe(25);
    expect(second[0]?.volume).toBe(26);
    expect(second[0]?.close).toBe(1.13);
  });
});
