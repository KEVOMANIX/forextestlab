import { describe, expect, it } from "vitest";

import type { PublicSessionState } from "./types";
import {
  defaultTradePlan,
  estimatedMarketEntry,
  tradePlanMetrics,
} from "./trade-plan";

function state(
  overrides: Partial<PublicSessionState> = {},
): PublicSessionState {
  return {
    sessionId: "session-1",
    config: {
      symbol: "EURUSD",
      symbols: ["EURUSD"],
      baseCurrency: "EUR",
      quoteCurrency: "USD",
      timeframe: "1m",
      startTime: 0,
      endTime: 1,
      startingBalance: "10000",
      accountCurrency: "USD",
      spreadPips: "1",
      commissionPerLot: "0",
      slippagePips: "0",
      executionPolicy: "conservative",
      pipSize: "0.0001",
      pricePrecision: 5,
      initialVisibleCount: 100,
    },
    status: "paused",
    speed: 60,
    visibleIndex: 100,
    totalCandles: 200,
    balance: "10000",
    equity: "10000",
    maxEquity: "10000",
    maxDrawdown: "0",
    maxDrawdownPercent: "0",
    currentPrice: "1.10000",
    currentTime: 1,
    openPositions: [],
    pendingOrders: [],
    bookmarks: [],
    closedTrades: [],
    equityCurve: [],
    lockedBeforeIndex: -1,
    dataSource: "test",
    demoData: false,
    anonymous: false,
    ...overrides,
  };
}

describe("trade planner", () => {
  it("estimates direction-aware market fills and starts without exits", () => {
    const current = state();
    expect(estimatedMarketEntry(current, "long")).toBe("1.10005");
    expect(estimatedMarketEntry(current, "short")).toBe("1.09995");
    expect(defaultTradePlan(current, "long")).toEqual({
      direction: "long",
      entryPrice: "1.10005",
      stopLoss: "",
      takeProfit: "",
    });
  });

  it("reports fixed-lot risk, reward, spread, pips and R:R", () => {
    const current = state();
    const plan = {
      ...defaultTradePlan(current, "long")!,
      stopLoss: "1.09805",
      takeProfit: "1.10405",
    };
    expect(
      tradePlanMetrics({
        state: current,
        plan,
        sizingMode: "fixed-lots",
        lots: "0.50",
      }),
    ).toEqual({
      valid: true,
      error: null,
      lots: "0.50",
      stopPips: "20.0",
      targetPips: "40.0",
      riskReward: "2.00",
      riskAmount: "100.00",
      projectedProfit: "200.00",
      spreadCost: "5.00",
      margin: "550.03",
      availableMargin: "9449.97",
      leverage: "100",
      pipValue: "5.00",
      tradeValue: "55002.50",
    });
  });

  it("calculates lots from account risk and rejects inverted levels", () => {
    const current = state();
    const plan = {
      ...defaultTradePlan(current, "short")!,
      stopLoss: "1.10195",
      takeProfit: "1.09595",
    };
    const metrics = tradePlanMetrics({
      state: current,
      plan,
      sizingMode: "risk-percent",
      riskPercent: "1",
    });
    expect(metrics.valid).toBe(true);
    expect(metrics.lots).toBe("0.50");
    expect(metrics.riskAmount).toBe("100.00");

    expect(
      tradePlanMetrics({
        state: current,
        plan: { ...plan, stopLoss: "1.09000" },
        sizingMode: "fixed-lots",
        lots: "0.10",
      }),
    ).toMatchObject({
      valid: false,
      error: "For a Sell plan, SL must be above entry and TP below it.",
    });
  });
});
