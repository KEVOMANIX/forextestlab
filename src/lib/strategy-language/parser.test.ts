import { describe, expect, it } from "vitest";
import { parseStrategy, STRATEGY_EXAMPLES } from "./parser";

describe("strategy language parser", () => {
  it("accepts the two published examples", () => {
    for (const code of Object.values(STRATEGY_EXAMPLES)) {
      const result = parseStrategy(code);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.program.signals).toHaveLength(2);
    }
  });

  it("returns line-specific errors and rejects arbitrary code", () => {
    const code = 'STRATEGY "Example"\nTIMEFRAME 1h\nBUY WHEN EMA(9) CROSSES ABOVE EMA(21)\nSTOP 20 PIPS\nTARGET 40 PIPS\nRISK 10%\nprocess.exit(1)';
    const result = parseStrategy(code);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 6 }),
      expect.objectContaining({ line: 7 }),
    ]));
  });

  it("rejects duplicate declarations and invalid indicator periods", () => {
    const result = parseStrategy('STRATEGY "Example"\nTIMEFRAME 1h\nTIMEFRAME 4h\nBUY WHEN EMA(999) ABOVE EMA(21)\nSTOP 20 PIPS\nTARGET 40 PIPS\nRISK 1%');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map(item => item.line)).toContain(3);
  });

  it("compiles Pine-inspired variables and order blocks into executable signals", () => {
    const result = parseStrategy('//@version=1\nstrategy("Trend", timeframe="1h", risk_percent=1)\nlength = input.int(21, title="Slow")\nfast = ta.ema(close, 9)\nslow = ta.sma(close, length)\nlongSignal = ta.crossover(fast, slow)\nif longSignal\n    strategy.entry("Long", strategy.long)\nstrategy.exit("Exit", stop_pips=20, take_profit_pips=40)');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.program).toMatchObject({ name: "Trend", timeframe: "1h", stopPips: 20, targetPips: 40, signals: [{ side: "BUY", left: { kind: "EMA", period: 9 }, right: { kind: "SMA", period: 21 }, comparison: "CROSSES ABOVE" }] });
  });

  it("rejects unsupported code and a missing indented entry without executing it", () => {
    const result = parseStrategy('strategy("Trend", timeframe="1h", risk_percent=1)\nif close > 1.1\nstrategy.entry("Long", strategy.long)\nprocess.exit(1)\nstrategy.exit("Exit", stop_pips=20, take_profit_pips=40)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map(item => item.line)).toEqual(expect.arrayContaining([3, 4]));
  });
});
