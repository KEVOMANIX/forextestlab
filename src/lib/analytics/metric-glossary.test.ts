import { describe, expect, it } from "vitest";

import { definedMetrics, explainMetric } from "./metric-glossary";

describe("looking a metric up", () => {
  it("ignores the casing and spacing a screen happens to use", () => {
    const canonical = explainMetric("recovery factor");
    expect(canonical).not.toBeNull();
    expect(explainMetric("Recovery Factor")).toEqual(canonical);
    expect(explainMetric("  recovery   factor  ")).toEqual(canonical);
    expect(explainMetric("Recovery factor:")).toEqual(canonical);
  });

  it("follows an alias to the one definition", () => {
    // The dashboard says "Net P/L" and the report says "Net realised P/L".
    // A reader should not get a different answer depending on which screen
    // they opened the (i) on.
    expect(explainMetric("Net P/L")).toEqual(explainMetric("Net realised P/L"));
    expect(explainMetric("Average hold")).toEqual(explainMetric("Avg hold"));
  });

  it("returns null for a term with no definition", () => {
    expect(explainMetric("Some label nobody wrote copy for")).toBeNull();
  });

  it("never resolves an alias to a missing definition", () => {
    for (const term of definedMetrics()) {
      expect(explainMetric(term), `"${term}" resolves to nothing`).not.toBeNull();
    }
  });
});

describe("what the definitions say", () => {
  it("explains recovery factor in terms a trader can act on", () => {
    const recovery = explainMetric("Recovery factor")!;
    expect(recovery.how).toContain("Net profit divided by maximum drawdown");
    // The number flatters a lucky test, and the definition has to say so.
    expect(recovery.read).toMatch(/below 1\.0/i);
  });

  it("warns where a metric commonly misleads", () => {
    // These three are the classic traps: a win rate that rises as profit
    // falls, a profit factor inflated by a short sample, and a concentration
    // figure that looks like a result but is really a warning.
    expect(explainMetric("Win rate")!.read).toMatch(/not an edge on its own/i);
    expect(explainMetric("Profit factor")!.read).toMatch(/luck/i);
    expect(explainMetric("Profit concentration")!.read).toMatch(/lower is better/i);
  });

  it("keeps every definition short enough to read in a popover", () => {
    for (const term of definedMetrics()) {
      const explainer = explainMetric(term)!;
      expect(explainer.what.length, `"${term}" — what`).toBeLessThan(220);
      expect(explainer.how?.length ?? 0, `"${term}" — how`).toBeLessThan(320);
      expect(explainer.read?.length ?? 0, `"${term}" — read`).toBeLessThan(400);
    }
  });
});
