import { describe, expect, it } from "vitest";

import { aggregatesFromPnls, describePerformance, parsePerformancePeriod, periodStart } from "./practice-performance";

describe("aggregatesFromPnls", () => {
  it("has nothing to say about no trades", () => {
    expect(aggregatesFromPnls([])).toBeNull();
  });

  it("measures the largest fall from a running peak, starting from zero", () => {
    const result = aggregatesFromPnls([50, -20, -40, 30, 100, -10])!;
    expect(result.curve.map((point) => point.total)).toEqual([50, 30, -10, 20, 120, 110]);
    expect(result.maxDrawdown).toBe("60.00");
    expect(result.troughN).toBe(3);
    expect(result).toEqual(expect.objectContaining({ tradeCount: 6, wins: 3, losses: 3, netPnl: "110.00", bestTrade: "100.00", worstTrade: "-40.00" }));
  });

  it("counts a fall below zero from the start as a drawdown", () => {
    expect(aggregatesFromPnls([-25, 10])).toEqual(expect.objectContaining({ maxDrawdown: "25.00", troughN: 1 }));
  });
});

describe("describePerformance", () => {
  it("puts the size of wins and losses beside the win rate", () => {
    // Two small losses, one large win: a 33% win rate that still makes money.
    const result = describePerformance("all", aggregatesFromPnls(["-10", "-20", "75"])!);
    expect(result).toEqual(expect.objectContaining({
      period: "all",
      averagePerTrade: "15.00",
      profitFactor: 2.5,
      averageWin: "75.00",
      averageLoss: "15.00",
      winLossRatio: 5,
    }));
    expect(result.winRate).toBeCloseTo(33.33, 2);
    expect(result.breakEvenWinRate).toBeCloseTo(16.67, 2);
  });

  it("reports no profit factor or break-even without a losing trade", () => {
    const result = describePerformance("30d", aggregatesFromPnls([10, 20])!);
    expect(result.profitFactor).toBeNull();
    expect(result.winLossRatio).toBeNull();
    expect(result.breakEvenWinRate).toBeNull();
    expect(result.troughN).toBeNull();
  });
});

describe("periods", () => {
  it("accepts only the offered periods", () => {
    expect(parsePerformancePeriod("30d")).toBe("30d");
    expect(parsePerformancePeriod("all")).toBe("all");
    expect(parsePerformancePeriod("7d")).toBeNull();
    expect(parsePerformancePeriod(undefined)).toBeNull();
  });

  it("starts 30 or 90 days back, and all time has no start", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(periodStart("30d", now)?.toISOString()).toBe("2026-09-22T12:00:00.000Z");
    expect(periodStart("90d", now)?.toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
  });
});
