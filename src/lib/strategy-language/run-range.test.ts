import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data/types";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { parseStrategy } from "./parser";
import { runStrategy } from "./run";
import { runStrategyRange } from "./run-range";

const parsed = parseStrategy('STRATEGY "Long history"\nTIMEFRAME 1h\nBUY WHEN CLOSE CROSSES ABOVE 1.1000\nSTOP 10 PIPS\nTARGET 20 PIPS\nRISK 1%');
if (!parsed.ok) throw new Error("Invalid test program");
const startTime = Date.UTC(2020, 0, 1);
const candles: Candle[] = Array.from({ length: 6_000 }, (_, index) => {
  const value = index % 60 === 10 ? 1.1005 : 1.0990;
  return { timestamp: startTime + index * 3_600_000, open: value.toFixed(5), high: (value + 0.003).toFixed(5), low: (value - 0.0002).toFixed(5), close: value.toFixed(5), source: "test" };
});
const options = { symbol: getSymbolDefinition("EURUSD")!, startTime, endTime: candles[candles.length - 1]!.timestamp, startingBalance: "10000", spreadPips: "0", slippagePips: "0", commissionPerLot: "0" };

describe("long strategy ranges", () => {
  it("reads month-sized overlapping chunks without duplicate bars or a 5000-bar cap", async () => {
    let calls = 0;
    const provider = { async getCandles(request: { startTime: number; endTime: number }) {
      calls++;
      return candles.filter(candle => candle.timestamp >= request.startTime && candle.timestamp <= request.endTime);
    } };
    const progress: number[] = [];
    const report = await runStrategyRange(provider, parsed.program, { ...options, onProgress: event => progress.push(event.bars) });
    const batch = runStrategy(parsed.program, candles, options);
    expect(calls).toBeGreaterThan(6);
    expect(progress.at(-1)).toBe(6_000);
    expect(report.bars).toBe(6_000);
    expect(report.trades).toEqual(batch.trades);
    expect(report.endingBalance).toBe(batch.endingBalance);
    expect(report.equity.length).toBeLessThanOrEqual(1_501);
  });
});
