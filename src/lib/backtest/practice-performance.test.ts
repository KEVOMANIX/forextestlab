import { describe, expect, it } from "vitest";

import { practicePerformance } from "./practice-performance";

describe("practicePerformance", () => {
  it("has nothing to say about no trades", () => {
    expect(practicePerformance([])).toBeNull();
  });

  it("puts the size of wins and losses beside the win rate", () => {
    // Two small losses, one large win: a 33% win rate that still makes money.
    const result = practicePerformance(["-10", "-20", "75"])!;
    expect(result).toEqual(expect.objectContaining({
      tradeCount: 3,
      wins: 1,
      losses: 2,
      netPnl: "45.00",
      expectancy: "15.00",
      grossProfit: "75.00",
      grossLoss: "30.00",
      profitFactor: 2.5,
      averageWin: "75.00",
      averageLoss: "15.00",
      winLossRatio: 5,
      bestTrade: "75.00",
      worstTrade: "-20.00",
    }));
    expect(result.winRate).toBeCloseTo(33.33, 2);
    expect(result.breakEvenWinRate).toBeCloseTo(16.67, 2);
  });

  it("measures the largest fall from a running peak, starting from zero", () => {
    const result = practicePerformance([50, -20, -40, 30, 100, -10])!;
    expect(result.curve).toEqual([0, 50, 30, -10, 20, 120, 110]);
    expect(result.maxDrawdown).toBe("60.00");
    expect(result.drawdown).toEqual({ peakIndex: 1, troughIndex: 3 });
  });

  it("reports no profit factor or ratio without a losing trade", () => {
    const result = practicePerformance([10, 20])!;
    expect(result.profitFactor).toBeNull();
    expect(result.winLossRatio).toBeNull();
    expect(result.breakEvenWinRate).toBeNull();
    expect(result.maxDrawdown).toBe("0.00");
    expect(result.drawdown).toBeNull();
  });
});
