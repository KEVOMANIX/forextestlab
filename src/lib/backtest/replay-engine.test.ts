import { describe, it, expect } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import type { EngineContext, SessionConfig } from "./types";
import {
  closePosition,
  createSessionState,
  placeOrder,
  restart,
  revealNext,
  stepBack,
} from "./replay-engine";

function cfg(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    symbol: "EURUSD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "5m",
    startTime: 0,
    endTime: 0,
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

function c(ts: number, o: string, h: string, l: string, cl: string): Candle {
  return { timestamp: ts, open: o, high: h, low: l, close: cl, source: "test" };
}

function ctx(candles: Candle[], config = cfg()): EngineContext {
  return {
    candles,
    state: createSessionState("s1", config, candles.length, candles, "test", true),
  };
}

const FLAT = [
  c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
  c(1, "1.10000", "1.10010", "1.09990", "1.10000"),
  c(2, "1.10000", "1.10010", "1.09990", "1.10000"),
];

describe("replay indexing", () => {
  it("starts at the initial visible candle and advances one at a time", () => {
    const e = ctx(FLAT);
    expect(e.state.visibleIndex).toBe(0);
    expect(revealNext(e)).toBe(true);
    expect(e.state.visibleIndex).toBe(1);
    expect(revealNext(e)).toBe(true);
    expect(e.state.visibleIndex).toBe(2);
    // At the end it cannot advance and is marked finished.
    expect(revealNext(e)).toBe(false);
    expect(e.state.status).toBe("finished");
  });

  it("never reveals beyond the final candle", () => {
    const e = ctx(FLAT);
    for (let i = 0; i < 10; i += 1) revealNext(e);
    expect(e.state.visibleIndex).toBeLessThanOrEqual(FLAT.length - 1);
  });
});

describe("orders and step-back locking", () => {
  it("opens one position and rejects a second", () => {
    const e = ctx(FLAT);
    expect(placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0" }).ok).toBe(true);
    expect(e.state.openPosition).not.toBeNull();
    const second = placeOrder(e, { direction: "short", sizingMode: "fixed-lots", lots: "1.0" });
    expect(second.ok).toBe(false);
  });

  it("disables step-back once a trade has been placed", () => {
    const e = ctx(FLAT, cfg({ initialVisibleCount: 1 }));
    revealNext(e); // index 1
    expect(stepBack(e)).toBe(true); // allowed before any order
    revealNext(e); // index 1 again
    placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0" });
    expect(stepBack(e)).toBe(false); // locked after an order
  });
});

describe("stop-loss / take-profit execution", () => {
  it("closes a long at the stop-loss when breached", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10000", "1.10010", "1.09800", "1.09850"),
    ];
    const e = ctx(candles);
    placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0", stopLoss: "1.09900", takeProfit: "1.10500" });
    revealNext(e);
    expect(e.state.openPosition).toBeNull();
    expect(e.state.closedTrades).toHaveLength(1);
    expect(e.state.closedTrades[0]?.exitReason).toBe("stop-loss");
    // pips = (1.09900 - 1.10000)/0.0001 = -10 -> -100.00
    expect(e.state.closedTrades[0]?.pnl).toBe("-100.00");
    expect(e.state.balance).toBe("9900.00");
  });

  it("closes a long at the take-profit when reached", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10000", "1.10300", "1.09990", "1.10200"),
    ];
    const e = ctx(candles);
    placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0", stopLoss: "1.09000", takeProfit: "1.10200" });
    revealNext(e);
    expect(e.state.closedTrades[0]?.exitReason).toBe("take-profit");
    expect(e.state.closedTrades[0]?.pnl).toBe("200.00");
    expect(e.state.balance).toBe("10200.00");
  });
});

describe("manual close and drawdown", () => {
  it("closes manually and records realised P&L", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10100", "1.10110", "1.10090", "1.10100"),
    ];
    const e = ctx(candles);
    placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0" });
    revealNext(e);
    closePosition(e);
    expect(e.state.closedTrades[0]?.exitReason).toBe("manual");
    expect(e.state.closedTrades[0]?.pnl).toBe("100.00");
  });

  it("tracks max drawdown from unrealised equity", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.09000", "1.10010", "1.08990", "1.09000"),
      c(2, "1.10000", "1.10010", "1.08990", "1.10000"),
    ];
    const e = ctx(candles);
    placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0" });
    revealNext(e); // price drops to 1.09000 -> unreal -1000
    expect(e.state.equity).toBe("9000.00");
    expect(e.state.maxDrawdown).toBe("1000.00");
    expect(e.state.maxDrawdownPercent).toBe("10.0");
  });
});

describe("restart", () => {
  it("resets state to the opening candles and clears trades", () => {
    const e = ctx(FLAT);
    placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0" });
    revealNext(e);
    closePosition(e);
    restart(e);
    expect(e.state.visibleIndex).toBe(0);
    expect(e.state.closedTrades).toHaveLength(0);
    expect(e.state.openPosition).toBeNull();
    expect(e.state.balance).toBe("10000.00");
  });
});
