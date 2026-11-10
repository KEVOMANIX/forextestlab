import { beforeEach, describe, expect, it, vi } from "vitest";
import { deletePineResult, isPineSummary, maxDrawdownPercent, readPineResults, sampleEquity, savePineResult, setPineResultsCache, type PineTestSummary } from "./pine-results";

const summary: PineTestSummary = { ranAt: 1, symbol: "EURUSD", timeframe: "15m", from: "2025-10-01", through: "2025-12-31", netPnl: 250, netPercent: 2.5, profitFactor: 1.4, winRate: 50, trades: 10, maxDrawdownPercent: 3, equity: [10_000, 10_250] };
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));

describe("Strategy Lab results", () => {
  beforeEach(() => { setPineResultsCache({}); fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });

  it("keeps the last test of each script and sends it to the account", async () => {
    await savePineResult("a", summary);
    await savePineResult("a", { ...summary, netPercent: 4 });
    await savePineResult("b", summary);
    expect(readPineResults().a?.netPercent).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ action: "result", id: "a" });
    deletePineResult("a");
    expect(Object.keys(readPineResults())).toEqual(["b"]);
  });

  it("ignores damaged results", () => {
    setPineResultsCache({ a: { symbol: 3 }, b: summary, c: { ...summary, equity: ["x"] } });
    expect(Object.keys(readPineResults())).toEqual(["b"]);
    expect(isPineSummary(null)).toBe(false);
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
