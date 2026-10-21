import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: queryRaw } }));

import { loadPracticePerformance } from "./practice-performance-query";

function sqlOf(call: number): { sql: string; values: unknown[] } {
  const query = queryRaw.mock.calls[call]![0] as { sql: string; values: unknown[] };
  return { sql: query.sql, values: query.values };
}

describe("loadPracticePerformance", () => {
  beforeEach(() => queryRaw.mockReset());

  it("returns nothing for a period without practice trades", async () => {
    queryRaw.mockResolvedValueOnce([{ tradeCount: BigInt(0), wins: BigInt(0), losses: BigInt(0), netPnl: "0", grossProfit: "0", grossLoss: "0", bestTrade: null, worstTrade: null }]);
    expect(await loadPracticePerformance("owner", "30d")).toBeNull();
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("keeps challenges and experimental trades out, and filters by period", async () => {
    queryRaw.mockResolvedValueOnce([{ tradeCount: BigInt(0), wins: BigInt(0), losses: BigInt(0), netPnl: "0", grossProfit: "0", grossLoss: "0", bestTrade: null, worstTrade: null }]);
    await loadPracticePerformance("owner", "30d");
    const { sql, values } = sqlOf(0);
    expect(sql).toContain(`"challengeStatus" IS NULL`);
    expect(sql).toContain(`"validity" <> 'experimental'`);
    expect(sql).toContain(`trade."createdAt" >=`);
    expect(values).toContain("owner");
    expect(values.some((value) => value instanceof Date)).toBe(true);
  });

  it("has no date filter for all time", async () => {
    queryRaw.mockResolvedValueOnce([{ tradeCount: BigInt(0), wins: BigInt(0), losses: BigInt(0), netPnl: "0", grossProfit: "0", grossLoss: "0", bestTrade: null, worstTrade: null }]);
    await loadPracticePerformance("owner", "all");
    expect(sqlOf(0).sql).not.toContain(`trade."createdAt" >=`);
  });

  it("combines the totals with the sampled curve and its deepest drawdown", async () => {
    queryRaw
      .mockResolvedValueOnce([{ tradeCount: BigInt(4), wins: BigInt(2), losses: BigInt(2), netPnl: "45.5", grossProfit: "95.5", grossLoss: "50", bestTrade: "60", worstTrade: "-30" }])
      .mockResolvedValueOnce([
        { n: BigInt(1), total: "35.5", drawdown: "0" },
        { n: BigInt(2), total: "15.5", drawdown: "20" },
        { n: BigInt(3), total: "-14.5", drawdown: "50" },
        { n: BigInt(4), total: "45.5", drawdown: "0" },
      ]);
    const result = await loadPracticePerformance("owner", "all");
    expect(result).toEqual(expect.objectContaining({
      period: "all",
      tradeCount: 4,
      netPnl: "45.50",
      maxDrawdown: "50.00",
      troughN: 3,
      bestTrade: "60.00",
      worstTrade: "-30.00",
      averagePerTrade: "11.38",
      profitFactor: 1.91,
    }));
    expect(result!.curve).toEqual([{ n: 1, total: 35.5 }, { n: 2, total: 15.5 }, { n: 3, total: -14.5 }, { n: 4, total: 45.5 }]);
  });
});
