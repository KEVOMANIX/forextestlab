import { beforeEach, describe, expect, it } from "vitest";
import { deletePineResult, maxDrawdownPercent, readPineResults, sampleEquity, savePineResult, type PineTestSummary } from "./pine-results";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) } });

const summary: PineTestSummary = { ranAt: 1, symbol: "EURUSD", timeframe: "15m", from: "2025-10-01", through: "2025-12-31", netPnl: 250, netPercent: 2.5, profitFactor: 1.4, winRate: 50, trades: 10, maxDrawdownPercent: 3, equity: [10_000, 10_250] };

describe("Strategy Lab results", () => {
  beforeEach(() => store.clear());

  it("keeps the last test of each script", () => {
    savePineResult("a", summary);
    savePineResult("a", { ...summary, netPercent: 4 });
    savePineResult("b", summary);
    expect(readPineResults().a?.netPercent).toBe(4);
    deletePineResult("a");
    expect(Object.keys(readPineResults())).toEqual(["b"]);
  });

  it("ignores damaged storage", () => {
    store.set("forextestlab:pine-results:v1", JSON.stringify({ a: { symbol: 3 }, b: summary }));
    expect(Object.keys(readPineResults())).toEqual(["b"]);
    store.set("forextestlab:pine-results:v1", "not json");
    expect(readPineResults()).toEqual({});
  });

  it("samples equity and measures drawdown", () => {
    const values = Array.from({ length: 1000 }, (_, index) => index);
    const sampled = sampleEquity(values, 40);
    expect(sampled).toHaveLength(40);
    expect(sampled[0]).toBe(0);
    expect(sampled.at(-1)).toBe(999);
    expect(maxDrawdownPercent([100, 120, 90, 130, 117])).toBeCloseTo(25);
  });
});
