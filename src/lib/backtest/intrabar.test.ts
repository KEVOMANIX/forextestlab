import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data/types";
import { checkStopTakeProfit, recordAmbiguousCandles } from "./execution";
import { buildIntrabarPath, candleAfter, firstLevelHit, partialCandle, pendingTouchIndex } from "./intrabar";
import { decodeTicks, encodeTicks, monthsBetween, splitByDay, tickSymbolFor } from "@/lib/market-data/ticks/format";

const MINUTE = 60_000;
const T0 = Date.parse("2022-03-25T10:00:00Z");

/** Ticks that walk through `mids` (EUR/USD-like, 0.2 pip spread), evenly over one minute. */
function ticksThrough(mids: number[], offset = 0) {
  const n = mids.length;
  return {
    time: Float64Array.from(mids.map((_, index) => T0 + Math.round((index / n) * (MINUTE - 1)))),
    bid: Float64Array.from(mids.map((mid) => mid + offset - 0.00001)),
    ask: Float64Array.from(mids.map((mid) => mid + offset + 0.00001)),
  };
}

const candle = (open: string, high: string, low: string, close: string, path?: Candle["path"]): Candle => ({ timestamp: T0, open, high, low, close, source: "test", path });

describe("tick format", () => {
  it("round-trips ticks through the binary layout", () => {
    const ticks = { time: Float64Array.from([T0, T0 + 250, T0 + 900]), bid: Float64Array.from([1.10001, 1.10004, 1.09998]), ask: Float64Array.from([1.10003, 1.10006, 1.10001]) };
    const back = decodeTicks(new Uint8Array(encodeTicks(ticks)));
    expect([...back.time]).toEqual([...ticks.time]);
    expect([...back.bid]).toEqual([...ticks.bid]);
    back.ask.forEach((ask, index) => expect(ask).toBeCloseTo(ticks.ask[index]!, 9));
  });

  it("splits by UTC day and lists the months a span touches", () => {
    const day = 86_400_000;
    const ticks = { time: Float64Array.from([T0, T0 + day, T0 + day + 5]), bid: new Float64Array(3), ask: new Float64Array(3) };
    expect(splitByDay(ticks).map(([, part]) => part.time.length)).toEqual([1, 2]);
    expect(monthsBetween(Date.parse("2021-12-30T00:00:00Z"), Date.parse("2022-02-02T00:00:00Z"))).toEqual(["2021-12", "2022-01", "2022-02"]);
  });

  it("maps index CFDs to the tick archive's codes", () => {
    expect(tickSymbolFor("USATECHIDXUSD")).toBe("NSXUSD");
    expect(tickSymbolFor("eurusd")).toBe("EURUSD");
  });
});

describe("intrabar path", () => {
  it("fits the tick shape onto the candle's own range and frames it with open and close", () => {
    // Ticks run 0.3 pip above the candle archive: shape is kept, prices are the candle's.
    const ticks = ticksThrough([1.1000, 1.1010, 1.0990, 1.1005], 0.00003);
    const path = buildIntrabarPath(ticks, T0, T0 + MINUTE, candle("1.10000", "1.10100", "1.09900", "1.10050"), 0.0001, 5)!;
    expect(path.p[0]).toBe(1.1);
    expect(Math.max(...path.p)).toBe(1.101);
    expect(Math.min(...path.p)).toBe(1.099);
    expect(path.p.at(-1)).toBe(1.1005);
    expect(path.p.indexOf(1.101)).toBeLessThan(path.p.indexOf(1.099)); // high came before low
    expect(path.t.every((t, index) => index === 0 || t >= path.t[index - 1]!)).toBe(true);
  });

  it("drops wiggles smaller than the zigzag threshold", () => {
    const noisy = [1.1, 1.10001, 1.1, 1.10001, 1.1, 1.101, 1.10099, 1.101, 1.099];
    const path = buildIntrabarPath(ticksThrough(noisy), T0, T0 + MINUTE, candle("1.10000", "1.10100", "1.09900", "1.09900"), 0.0001, 5)!;
    expect(path.p).toEqual([1.1, 1.101, 1.099]);
  });

  it("needs at least two ticks", () => {
    expect(buildIntrabarPath(ticksThrough([1.1]), T0, T0 + MINUTE, candle("1.1", "1.1", "1.1", "1.1"), 0.0001, 5)).toBeUndefined();
  });

  it("says which level a long reaches first, on the bid", () => {
    const path = { t: [0, 20_000, 40_000, 59_000], p: [1.1, 1.101, 1.099, 1.1] };
    expect(firstLevelHit(path, "long", 1.0995, 1.1008, 0.00001)).toBe("take-profit");
    expect(firstLevelHit({ t: [0, 1, 2, 3], p: [1.1, 1.099, 1.101, 1.1] }, "long", 1.0995, 1.1008, 0.00001)).toBe("stop-loss");
  });

  it("finds where a pending order fills and keeps only what came after", () => {
    const path = { t: [0, 20_000, 40_000, 59_000], p: [1.1, 1.099, 1.101, 1.1005] };
    // Buy stop at 1.1008 (ask): reached on the way up to 1.101, after the low.
    const index = pendingTouchIndex(path, true, "stop", 1.1008, 0.00001);
    expect(index).toBe(2);
    const rest = candleAfter(candle("1.10000", "1.10100", "1.09900", "1.10050", path), index, 1.10079, 5);
    expect(rest.low).toBe("1.10050"); // the earlier 1.0990 low can no longer stop it
    expect(rest.high).toBe("1.10100");
  });
});

describe("stop and target inside one candle", () => {
  const bar = (path?: Candle["path"]) => candle("1.10000", "1.10100", "1.09900", "1.10000", path);

  it("falls back to the execution policy without ticks, and records the candle", () => {
    const { result, ambiguous } = recordAmbiguousCandles(() => checkStopTakeProfit("long", "1.09950", "1.10080", bar(), "0", "0.0001", "conservative"));
    expect(result).toMatchObject({ reason: "stop-loss", intrabarAmbiguous: true });
    expect([...ambiguous]).toEqual([T0]);
  });

  it("lets the tick path decide, overriding a conservative policy", () => {
    const upFirst = { t: [0, 20_000, 40_000, 59_000], p: [1.1, 1.101, 1.099, 1.1] };
    const { result, ambiguous } = recordAmbiguousCandles(() => checkStopTakeProfit("long", "1.09950", "1.10080", bar(upFirst), "0", "0.0001", "conservative"));
    expect(result).toMatchObject({ reason: "take-profit", price: "1.10080", intrabarAmbiguous: false, resolvedByTicks: true });
    expect(ambiguous.size).toBe(0);
  });

  it("applies the session spread: a short is managed on the ask", () => {
    const downFirst = { t: [0, 1, 2, 3], p: [1.1, 1.099, 1.101, 1.1] };
    // 2-pip spread: ask = mid + 0.0001. TP 1.0992 is reached at mid 1.0990 (ask 1.0991), before the stop.
    expect(checkStopTakeProfit("short", "1.10090", "1.09920", bar(downFirst), "2", "0.0001", "conservative")).toMatchObject({ reason: "take-profit", resolvedByTicks: true });
  });
});

describe("tick replay forming candle", () => {
  const path = { t: [0, 20_000, 40_000, 59_000], p: [1.1, 1.101, 1.099, 1.1005] };
  const full = candle("1.10000", "1.10100", "1.09900", "1.10050", path);

  it("follows the path, interpolating between points, and never shows what is still to come", () => {
    expect(partialCandle(full, 10_000, 5)).toMatchObject({ open: "1.10000", high: "1.10050", low: "1.10000", close: "1.10050", source: "forming" });
    expect(partialCandle(full, 30_000, 5)).toMatchObject({ high: "1.10100", low: "1.10000", close: "1.10000" });
    expect(partialCandle(full, 59_000, 5)).toMatchObject({ high: "1.10100", low: "1.09900", close: "1.10050" });
  });

  it("needs a path", () => {
    expect(partialCandle(candle("1.1", "1.1", "1.1", "1.1"), 1000, 5)).toBeNull();
  });
});
