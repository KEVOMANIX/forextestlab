import { describe, expect, it } from "vitest";

import { tradingGuardMessage } from "./trade-guards";
import type { PublicSessionState } from "./types";

const state = {
  sessionId: "session",
  config: {
    symbol: "EURUSD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "1m",
    startTime: 0,
    endTime: 10,
    startingBalance: "10000",
    accountCurrency: "USD",
    spreadPips: "0",
    commissionPerLot: "0",
    slippagePips: "0",
    executionPolicy: "conservative",
    pipSize: "0.0001",
    pricePrecision: 5,
    initialVisibleCount: 1,
  },
  status: "paused",
  speed: 60,
  visibleIndex: 1,
  totalCandles: 10,
  balance: "10000",
  equity: "10000",
  maxEquity: "10000",
  maxDrawdown: "0",
  maxDrawdownPercent: "0",
  currentPrice: "1.10000",
  currentTime: Date.UTC(2025, 0, 6, 12),
  openPositions: [],
  pendingOrders: [],
  bookmarks: [],
  closedTrades: [],
  equityCurve: [],
  lockedBeforeIndex: 0,
  dataSource: "test",
  demoData: false,
  anonymous: false,
} satisfies PublicSessionState;

const limits = {
  maxRiskPerTradePercent: 1,
  dailyLossLimitPercent: 0,
  maxDrawdownLimitPercent: 0,
  sessionTradeLimit: 0,
  sessionGoalAmount: 0,
};

describe("trading safeguards", () => {
  it("blocks risk-percent orders above the configured maximum", () => {
    expect(tradingGuardMessage(state, {
      direction: "long",
      sizingMode: "risk-percent",
      riskPercent: "2",
      stopLoss: "1.09000",
    }, limits)).toContain("above your 1% limit");
  });

  it("requires a stop for fixed-lot orders when a risk maximum is enabled", () => {
    expect(tradingGuardMessage(state, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "0.1",
    }, limits)).toContain("Add a stop loss");
  });
});
