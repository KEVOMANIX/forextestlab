import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import type { ClosedTrade, SessionConfig, SessionState } from "./types";

const getCandles = vi.fn<(request: { symbol: string; startTime: number; endTime: number }) => Promise<Candle[]>>();

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({ getCandles }),
}));

const { buildExitQualityReport } = await import("./exit-quality-server");

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    symbol: "EURUSD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "5m",
    startTime: 0,
    endTime: 100_000,
    startingBalance: "10000",
    accountCurrency: "USD",
    spreadPips: "0",
    commissionPerLot: "0",
    slippagePips: "0",
    executionPolicy: "conservative",
    pipSize: "0.0001",
    pricePrecision: 5,
    initialVisibleCount: 1,
    ...overrides,
  };
}

/** A 1.00 lot long from 1.10000 with a 20-pip stop, so $200 of risk is 1R. */
function trade(overrides: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: "t1",
    symbol: "EURUSD",
    direction: "long",
    entryPrice: "1.10000",
    exitPrice: "1.10100",
    entryTime: 1_000,
    exitTime: 2_000,
    entryIndex: 0,
    exitIndex: 1,
    lots: "1.00",
    stopLoss: "1.09800",
    takeProfit: "1.10600",
    initialStopLoss: "1.09800",
    initialTakeProfit: "1.10600",
    initialRiskAmount: "200.00",
    commission: "0",
    pnl: "100.00",
    pips: "10.0",
    exitReason: "manual",
    intrabarAmbiguous: false,
    ...overrides,
  };
}

function state(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: "s1",
    config: config(),
    status: "finished",
    speed: 1,
    visibleIndex: 10,
    totalCandles: 11,
    balance: "10100",
    equity: "10100",
    maxEquity: "10100",
    maxDrawdown: "0.00",
    maxDrawdownPercent: "0.0",
    openPositions: [],
    pendingOrders: [],
    bookmarks: [],
    closedTrades: [trade()],
    equityCurve: [],
    dataSource: "test",
    demoData: false,
    ...overrides,
  } as SessionState;
}

function candle(timestamp: number, high: string, low: string): Candle {
  return {
    timestamp,
    open: "1.10000",
    high,
    low,
    close: "1.10000",
    source: "test",
  };
}

beforeEach(() => {
  getCandles.mockReset();
});

describe("building the exit quality report", () => {
  it("says nothing while the session is still being replayed", async () => {
    // The candles this needs lie past the reveal cursor, so a running session
    // must not get an answer at any price.
    for (const status of ["idle", "running", "paused"] as const) {
      expect(await buildExitQualityReport(state({ status }))).toBeNull();
      expect(getCandles).not.toHaveBeenCalled();
    }
  });

  it("tests a hand-closed trade against the plan it was opened with", async () => {
    getCandles.mockResolvedValue([
      candle(1_000, "1.10100", "1.09950"),
      candle(2_000, "1.10650", "1.10200"),
    ]);
    const report = await buildExitQualityReport(state());
    expect(report).not.toBeNull();
    expect(report!.tests).toHaveLength(1);
    expect(report!.tests[0]!.outcome).toBe("take-profit");
    // 60 pips against a 20-pip stop is 3R, against the 0.5R actually taken.
    expect(report!.tests[0]!.planR).toBeCloseTo(3, 5);
    expect(report!.summary.netDeltaR).toBeCloseTo(2.5, 5);
    expect(report!.summary.tested).toBe(1);
  });

  it("asks the provider only for what the walk needs", async () => {
    getCandles.mockResolvedValue([candle(1_000, "1.10650", "1.09950")]);
    await buildExitQualityReport(
      state({
        config: config({ endTime: 90_000 }),
        closedTrades: [
          trade({ id: "a", entryTime: 5_000 }),
          trade({ id: "b", entryTime: 3_000 }),
        ],
      }),
    );
    expect(getCandles).toHaveBeenCalledTimes(1);
    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "EURUSD",
        timeframe: "5m",
        // The earliest entry among the candidates, and the session's own end.
        startTime: 3_000,
        endTime: 90_000,
      }),
    );
  });

  it("fetches once per instrument", async () => {
    getCandles.mockResolvedValue([candle(1_000, "1.10650", "1.09950")]);
    await buildExitQualityReport(
      state({
        config: config({ symbols: ["EURUSD", "GBPUSD"] }),
        closedTrades: [
          trade({ id: "a", symbol: "EURUSD" }),
          trade({ id: "b", symbol: "EURUSD" }),
          trade({ id: "c", symbol: "GBPUSD" }),
        ],
      }),
    );
    expect(getCandles).toHaveBeenCalledTimes(2);
    expect(getCandles.mock.calls.map(([request]) => request.symbol).sort()).toEqual([
      "EURUSD",
      "GBPUSD",
    ]);
  });

  it("skips trades that followed their own plan", async () => {
    const report = await buildExitQualityReport(
      state({
        closedTrades: [
          trade({ id: "a", exitReason: "take-profit" }),
          trade({ id: "b", exitReason: "stop-loss" }),
          trade({ id: "c", exitReason: "session-end" }),
        ],
      }),
    );
    expect(report).toBeNull();
    expect(getCandles).not.toHaveBeenCalled();
  });

  it("survives an instrument whose history cannot be loaded", async () => {
    getCandles.mockImplementation(async ({ symbol }) => {
      if (symbol === "GBPUSD") throw new Error("no data");
      return [candle(1_000, "1.10650", "1.09950")];
    });
    const report = await buildExitQualityReport(
      state({
        config: config({ symbols: ["EURUSD", "GBPUSD"] }),
        closedTrades: [
          trade({ id: "a", symbol: "EURUSD" }),
          trade({ id: "b", symbol: "GBPUSD" }),
        ],
      }),
    );
    expect(report!.tests.map((test) => test.tradeId)).toEqual(["a"]);
  });

  it("says nothing rather than something empty when no candles come back", async () => {
    getCandles.mockResolvedValue([]);
    expect(await buildExitQualityReport(state())).toBeNull();
  });
});
