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
});
