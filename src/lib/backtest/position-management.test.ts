import { describe, expect, it } from "vitest";

import type { OpenPosition, PublicSessionState } from "./types";
import { livePositionMetrics } from "./position-management";

const position: OpenPosition = {
  id: "position-1",
  direction: "long",
  entryPrice: "1.10000",
  entryIndex: 1,
  entryTime: 1,
  lots: "0.50",
  stopLoss: "1.09800",
  takeProfit: null,
  initialStopLoss: "1.09800",
  initialTakeProfit: null,
  initialRiskAmount: "100.00",
  trailingStopPips: null,
  trailingBestPrice: null,
  maxFavorablePnl: "50.00",
  maxAdversePnl: "-25.00",
  commission: "0.00",
  unrealizedPnl: "50.00",
};

const state = {
  currentPrice: "1.10100",
  config: {
    symbol: "EURUSD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "1m",
    startTime: 0,
    endTime: 1,
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
} satisfies Pick<PublicSessionState, "config" | "currentPrice">;

describe("live position management metrics", () => {
  it("reports money, pips, R and remaining stop risk", () => {
    expect(livePositionMetrics(state, position)).toEqual({
      pnl: "50.00",
      pips: "10.0",
      rMultiple: "0.50",
      remainingRisk: "100.00",
      lockedProfit: null,
      canBreakEven: true,
    });
  });

  it("reports profit locked by a stop beyond break-even", () => {
    expect(
      livePositionMetrics(state, { ...position, stopLoss: "1.10050" }),
    ).toMatchObject({
      remainingRisk: null,
      lockedProfit: "25.00",
    });
  });
});
