import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data/types";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { parseStrategy } from "./parser";
import { runStrategy } from "./run";

const code = 'STRATEGY "Close breakout"\nTIMEFRAME 1h\nBUY WHEN CLOSE CROSSES ABOVE 1.1000\nSTOP 10 PIPS\nTARGET 20 PIPS\nRISK 1%';
const program = parseStrategy(code);
if (!program.ok) throw new Error("Test strategy did not parse");
const symbol = getSymbolDefinition("EURUSD")!;
const candle = (index: number, open: string, high: string, low: string, close: string): Candle => ({ timestamp: index * 3_600_000, open, high, low, close, source: "test" });
const options = { symbol, startTime: 0, startingBalance: "10000", spreadPips: "0", slippagePips: "0", commissionPerLot: "0" };

describe("strategy test runner", () => {
  it("uses the closed signal candle and enters only at the NEXT open", () => {
    const report = runStrategy(program.program, [
      candle(0, "1.0990", "1.0995", "1.0980", "1.0990"),
      candle(1, "1.0990", "1.1010", "1.0985", "1.1005"),
      candle(2, "1.1010", "1.1040", "1.1005", "1.1020"),
    ], options);
    expect(report.trades).toHaveLength(1);
    expect(report.trades[0]).toMatchObject({ entryTime: 2 * 3_600_000, entryPrice: "1.10100", exitPrice: "1.10300", reason: "take-profit", pnl: "200.00" });
    expect(report.profitFactor).toBeNull();
    expect(report.winRate).toBe(100);
  });

  it("takes the stop when both exit levels are inside the entry candle", () => {
    const report = runStrategy(program.program, [
      candle(0, "1.0990", "1.0995", "1.0980", "1.0990"),
      candle(1, "1.0990", "1.1010", "1.0985", "1.1005"),
      candle(2, "1.1010", "1.1040", "1.0990", "1.1015"),
    ], options);
    expect(report.trades[0]).toMatchObject({ reason: "stop-loss", intrabarAmbiguous: true, pnl: "-100.00" });
    expect(report.maxDrawdown).toBe("100.00");
  });

  it("does not react to a high that crossed when the candle closed below the level", () => {
    const report = runStrategy(program.program, [
      candle(0, "1.0990", "1.0995", "1.0980", "1.0990"),
      candle(1, "1.0990", "1.1010", "1.0985", "1.0995"),
      candle(2, "1.0995", "1.0998", "1.0985", "1.0990"),
    ], options);
    expect(report.trades).toHaveLength(0);
  });
});
