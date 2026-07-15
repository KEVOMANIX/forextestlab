import { describe, expect, it } from "vitest";

import { computeStatistics } from "@/lib/backtest/statistics";
import type { ClosedTrade, EquityPoint, TradeDirection } from "@/lib/backtest/types";

type TradeOverrides = Partial<ClosedTrade> & { pnl: string };

/** Build a minimal valid ClosedTrade; override only what a test cares about. */
function makeTrade(overrides: TradeOverrides): ClosedTrade {
  const direction: TradeDirection = overrides.direction ?? "long";
  return {
    id: overrides.id ?? "t",
    direction,
    entryPrice: overrides.entryPrice ?? "1.10000",
    exitPrice: overrides.exitPrice ?? "1.10000",
    entryTime: overrides.entryTime ?? 0,
    exitTime: overrides.exitTime ?? 1,
    entryIndex: overrides.entryIndex ?? 0,
    exitIndex: overrides.exitIndex ?? 1,
    lots: overrides.lots ?? "1",
    stopLoss: overrides.stopLoss ?? null,
    takeProfit: overrides.takeProfit ?? null,
    commission: overrides.commission ?? "0",
    pnl: overrides.pnl,
    pips: overrides.pips ?? "0",
    exitReason: overrides.exitReason ?? "manual",
    intrabarAmbiguous: overrides.intrabarAmbiguous ?? false,
  };
}

function makeEquityPoint(index: number, equity: string): EquityPoint {
  return { index, time: index, balance: equity, equity };
}

describe("computeStatistics", () => {
  it("returns a well-formed, NaN/Infinity-free object with no trades", () => {
    const stats = computeStatistics({
      startingBalance: "10000",
      endingBalance: "10000",
      trades: [],
      equityCurve: [],
    });

    expect(stats.totalTrades).toBe(0);
    expect(stats.winningTrades).toBe(0);
    expect(stats.losingTrades).toBe(0);
    expect(stats.netProfit).toBe("0.00");
    expect(stats.grossProfit).toBe("0.00");
    expect(stats.grossLoss).toBe("0.00");
    expect(stats.winRate).toBe("Not available");
    expect(stats.averageWin).toBe("Not available");
    expect(stats.averageLoss).toBe("Not available");
    expect(stats.largestWin).toBe("Not available");
    expect(stats.largestLoss).toBe("Not available");
    expect(stats.profitFactor).toBe("Not available");
    expect(stats.expectancy).toBe("Not available");
    expect(stats.averageRiskReward).toBe("Not available");
    expect(stats.maxDrawdown).toBe("0.00");
    expect(stats.maxDrawdownPercent).toBe("0.0");
    expect(stats.maxConsecutiveWins).toBe(0);
    expect(stats.maxConsecutiveLosses).toBe(0);

    // No metric should ever contain NaN or Infinity.
    for (const value of Object.values(stats)) {
      if (typeof value === "string") {
        expect(value).not.toMatch(/NaN|Infinity/);
      } else {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("computes gross/net/winRate/profitFactor/expectancy for a mixed set", () => {
    // Wins: 100, 300 -> grossProfit 400. Losses: -50, -150 -> grossLoss 200.
    // Plus a break-even trade (pnl 0): counts in totalTrades only.
    const trades = [
      makeTrade({ id: "1", pnl: "100" }),
      makeTrade({ id: "2", pnl: "-50" }),
      makeTrade({ id: "3", pnl: "300" }),
      makeTrade({ id: "4", pnl: "-150" }),
      makeTrade({ id: "5", pnl: "0" }),
    ];

    const stats = computeStatistics({
      startingBalance: "10000",
      endingBalance: "10200",
      trades,
      equityCurve: [],
    });

    expect(stats.totalTrades).toBe(5);
    expect(stats.winningTrades).toBe(2);
    expect(stats.losingTrades).toBe(2);
    expect(stats.grossProfit).toBe("400.00");
    expect(stats.grossLoss).toBe("200.00");
    expect(stats.netProfit).toBe("200.00"); // 10200 - 10000
    // winRate = 2 / 5 * 100 = 40.0
    expect(stats.winRate).toBe("40.0");
    // profitFactor = 400 / 200 = 2.00
    expect(stats.profitFactor).toBe("2.00");
    // averageWin = 400 / 2 = 200; averageLoss = 200 / 2 = 100
    expect(stats.averageWin).toBe("200.00");
    expect(stats.averageLoss).toBe("100.00");
    expect(stats.largestWin).toBe("300.00");
    expect(stats.largestLoss).toBe("150.00");
    // expectancy = (grossProfit - grossLoss) / totalTrades = 200 / 5 = 40
    expect(stats.expectancy).toBe("40.00");
  });

  it("reports profitFactor 'Not available' when there are no losses", () => {
    const trades = [
      makeTrade({ id: "1", pnl: "100" }),
      makeTrade({ id: "2", pnl: "250" }),
    ];

    const stats = computeStatistics({
      startingBalance: "1000",
      endingBalance: "1350",
      trades,
      equityCurve: [],
    });

    expect(stats.grossLoss).toBe("0.00");
    expect(stats.profitFactor).toBe("Not available");
    expect(stats.averageLoss).toBe("Not available");
    expect(stats.largestLoss).toBe("Not available");
    expect(stats.winRate).toBe("100.0");
  });

  it("counts the longest consecutive win and loss streaks", () => {
    // Sequence: W W W L L  W  L L L L
    // Longest win streak = 3, longest loss streak = 4.
    const pnls = ["1", "1", "1", "-1", "-1", "1", "-1", "-1", "-1", "-1"];
    const trades = pnls.map((pnl, i) => makeTrade({ id: String(i), pnl }));

    const stats = computeStatistics({
      startingBalance: "0",
      endingBalance: "0",
      trades,
      equityCurve: [],
    });

    expect(stats.maxConsecutiveWins).toBe(3);
    expect(stats.maxConsecutiveLosses).toBe(4);
  });

  it("breaks streaks on break-even trades", () => {
    // W W [0] W -> longest win streak should be 2, not 3.
    const trades = [
      makeTrade({ id: "1", pnl: "1" }),
      makeTrade({ id: "2", pnl: "1" }),
      makeTrade({ id: "3", pnl: "0" }),
      makeTrade({ id: "4", pnl: "1" }),
    ];

    const stats = computeStatistics({
      startingBalance: "0",
      endingBalance: "3",
      trades,
      equityCurve: [],
    });

    expect(stats.maxConsecutiveWins).toBe(2);
    expect(stats.maxConsecutiveLosses).toBe(0);
  });

  it("computes max drawdown and percent from a crafted equity curve", () => {
    // Peak at 12000, trough at 9000 -> drawdown 3000; percent = 3000/12000 = 25.0.
    const equityCurve = [
      makeEquityPoint(0, "10000"),
      makeEquityPoint(1, "12000"),
      makeEquityPoint(2, "11000"),
      makeEquityPoint(3, "9000"),
      makeEquityPoint(4, "10500"),
    ];

    const stats = computeStatistics({
      startingBalance: "10000",
      endingBalance: "10500",
      trades: [],
      equityCurve,
    });

    expect(stats.maxDrawdown).toBe("3000.00");
    expect(stats.maxDrawdownPercent).toBe("25.0");
  });

  it("computes average achieved risk/reward from SL and exit values", () => {
    // Trade A: entry 1.1000, SL 1.0900 (risk 0.0100), exit 1.1200 (reward 0.0200) -> 2.
    // Trade B: entry 1.2000, SL 1.1800 (risk 0.0200), exit 1.2100 (reward 0.0100) -> 0.5.
    // Trade C: no stop loss -> excluded. Average = (2 + 0.5) / 2 = 1.25.
    const trades = [
      makeTrade({
        id: "A",
        pnl: "200",
        entryPrice: "1.1000",
        stopLoss: "1.0900",
        exitPrice: "1.1200",
      }),
      makeTrade({
        id: "B",
        pnl: "-100",
        entryPrice: "1.2000",
        stopLoss: "1.1800",
        exitPrice: "1.2100",
      }),
      makeTrade({
        id: "C",
        pnl: "50",
        entryPrice: "1.3000",
        stopLoss: null,
        exitPrice: "1.3050",
      }),
    ];

    const stats = computeStatistics({
      startingBalance: "10000",
      endingBalance: "10150",
      trades,
      equityCurve: [],
    });

    expect(stats.averageRiskReward).toBe("1.25");
  });

  it("excludes zero-risk trades from average risk/reward", () => {
    // Only trade has stopLoss == entryPrice -> risk 0 -> excluded -> Not available.
    const trades = [
      makeTrade({
        id: "A",
        pnl: "10",
        entryPrice: "1.1000",
        stopLoss: "1.1000",
        exitPrice: "1.1100",
      }),
    ];

    const stats = computeStatistics({
      startingBalance: "1000",
      endingBalance: "1010",
      trades,
      equityCurve: [],
    });

    expect(stats.averageRiskReward).toBe("Not available");
  });
});
