import { describe, it, expect } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import type { EngineContext, SessionConfig } from "./types";
import {
  closePosition,
  cancelPendingOrder,
  createSessionState,
  modifyStopLoss,
  modifyTakeProfit,
  modifyTrailingStop,
  modifyPendingOrder,
  placeOrder,
  restart,
  revealNext,
  stepBack,
} from "./replay-engine";
import { updateTradeJournal } from "./trade-journal";

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

describe("batched replay equivalence", () => {
  it("produces identical order, execution, and statistics state", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10000", "1.10020", "1.09880", "1.09900"),
      c(2, "1.09900", "1.10100", "1.09890", "1.10080"),
      c(3, "1.10080", "1.10320", "1.10050", "1.10300"),
      c(4, "1.10300", "1.10310", "1.10280", "1.10290"),
    ];
    const base = ctx(candles);
    expect(
      placeOrder(base, {
        direction: "long",
        orderType: "limit",
        entryPrice: "1.09900",
        sizingMode: "fixed-lots",
        lots: "1",
        stopLoss: "1.09700",
        takeProfit: "1.10300",
      }).ok,
    ).toBe(true);
    const oneAtATime = structuredClone(base);
    const batched = structuredClone(base);

    for (let index = 0; index < 4; index += 1) revealNext(oneAtATime);
    for (const batchSize of [2, 2]) {
      for (let index = 0; index < batchSize; index += 1) revealNext(batched);
    }

    const comparable = (engine: EngineContext) => {
      const state = structuredClone(engine.state);
      for (const trade of state.closedTrades) {
        trade.id = "generated-trade-id";
        if (trade.journal) trade.journal.updatedAt = 0;
      }
      return state;
    };
    expect(comparable(batched)).toEqual(comparable(oneAtATime));
    expect(batched.state.closedTrades).toHaveLength(1);
    expect(batched.state.closedTrades[0]?.exitReason).toBe("take-profit");
    expect(batched.state.equityCurve).toHaveLength(5);
  });
});

describe("orders and step-back locking", () => {
  it("activates limit and stop orders only when their executable quote is touched", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10000", "1.10020", "1.09880", "1.09920"),
      c(2, "1.09920", "1.10220", "1.09910", "1.10200"),
    ];
    const e = ctx(candles);
    expect(placeOrder(e, {
      direction: "long",
      orderType: "limit",
      entryPrice: "1.09900",
      sizingMode: "fixed-lots",
      lots: "0.5",
    }).ok).toBe(true);
    expect(placeOrder(e, {
      direction: "long",
      orderType: "stop",
      entryPrice: "1.10100",
      sizingMode: "fixed-lots",
      lots: "0.25",
    }).ok).toBe(true);
    expect(e.state.openPositions).toHaveLength(0);

    revealNext(e);
    expect(e.state.pendingOrders[0]?.status).toBe("activated");
    expect(e.state.pendingOrders[1]?.status).toBe("pending");
    expect(e.state.openPositions[0]?.entryPrice).toBe("1.09900");
    expect(e.state.openPositions[0]?.id).toBe(
      `${e.state.pendingOrders[0]?.id}:position`,
    );

    revealNext(e);
    expect(e.state.pendingOrders[1]?.status).toBe("activated");
    expect(e.state.openPositions[1]?.entryPrice).toBe("1.10100");
  });

  it("fills a stop at the opening quote when a candle gaps through it", () => {
    const e = ctx([
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10300", "1.10400", "1.10250", "1.10350"),
    ]);
    placeOrder(e, {
      direction: "long",
      orderType: "stop",
      entryPrice: "1.10100",
      sizingMode: "fixed-lots",
      lots: "1",
    });
    revealNext(e);
    expect(e.state.pendingOrders[0]?.fillPrice).toBe("1.10300");
    expect(e.state.openPositions[0]?.entryPrice).toBe("1.10300");
  });

  it("modifies, cancels and expires pending orders with timestamps", () => {
    const e = ctx([
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(60_000, "1.10000", "1.10010", "1.09990", "1.10000"),
    ]);
    placeOrder(e, {
      direction: "long",
      orderType: "limit",
      entryPrice: "1.09800",
      expiresAt: 60_000,
      sizingMode: "fixed-lots",
      lots: "1",
    });
    const expiring = e.state.pendingOrders[0]!;
    expect(modifyPendingOrder(e, expiring.id, "1.09850").ok).toBe(true);
    expect(expiring.entryPrice).toBe("1.09850");

    placeOrder(e, {
      direction: "short",
      orderType: "limit",
      entryPrice: "1.10200",
      sizingMode: "fixed-lots",
      lots: "1",
    });
    const cancelled = e.state.pendingOrders[1]!;
    expect(cancelPendingOrder(e, cancelled.id).ok).toBe(true);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledTime).toBe(0);

    revealNext(e);
    expect(expiring.status).toBe("expired");
    expect(expiring.expiredTime).toBe(60_000);
  });

  it("opens multiple independent positions", () => {
    const e = ctx(FLAT);
    expect(placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0" }).ok).toBe(true);
    expect(e.state.openPositions).toHaveLength(1);
    const second = placeOrder(e, { direction: "short", sizingMode: "fixed-lots", lots: "1.0" });
    expect(second.ok).toBe(true);
    expect(e.state.openPositions).toHaveLength(2);
  });

  it("opens a new long without protection when none was requested", () => {
    const e = ctx(FLAT);
    placeOrder(e, { direction: "long", sizingMode: "fixed-lots", lots: "1.0" });
    expect(e.state.openPositions[0]?.stopLoss).toBeNull();
    expect(e.state.openPositions[0]?.takeProfit).toBeNull();
    expect(e.state.openPositions[0]?.initialStopLoss).toBeNull();
    expect(e.state.openPositions[0]?.initialTakeProfit).toBeNull();
    expect(e.state.openPositions[0]?.initialRiskAmount).toBeNull();
  });

  it("opens a new short without protection when none was requested", () => {
    const e = ctx(FLAT);
    placeOrder(e, { direction: "short", sizingMode: "fixed-lots", lots: "1.0" });
    expect(e.state.openPositions[0]?.stopLoss).toBeNull();
    expect(e.state.openPositions[0]?.takeProfit).toBeNull();
  });

  it("captures first protection levels when they are added after entry", () => {
    const e = ctx(FLAT);
    placeOrder(e, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1.0",
    });
    const position = e.state.openPositions[0]!;

    expect(modifyStopLoss(e, "1.09900", position.id).ok).toBe(true);
    expect(modifyTakeProfit(e, "1.10200", position.id).ok).toBe(true);
    expect(position.stopLoss).toBe("1.09900");
    expect(position.takeProfit).toBe("1.10200");
    expect(position.initialStopLoss).toBe("1.09900");
    expect(position.initialTakeProfit).toBe("1.10200");
    expect(position.initialRiskAmount).toBe("100.00");

    expect(modifyStopLoss(e, null, position.id).ok).toBe(true);
    expect(modifyTakeProfit(e, null, position.id).ok).toBe(true);
    expect(position.stopLoss).toBeNull();
    expect(position.takeProfit).toBeNull();
    expect(position.initialStopLoss).toBe("1.09900");
    expect(position.initialTakeProfit).toBe("1.10200");
  });

  it("tightens a trailing stop at favorable candle closes and executes it later", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10000", "1.10220", "1.09950", "1.10200"),
      c(2, "1.10200", "1.10320", "1.10150", "1.10300"),
      c(3, "1.10300", "1.10310", "1.10050", "1.10100"),
    ];
    const e = ctx(candles);
    placeOrder(e, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1.0",
    });
    const id = e.state.openPositions[0]!.id;

    expect(modifyTrailingStop(e, "10", id).ok).toBe(true);
    expect(e.state.openPositions[0]?.stopLoss).toBe("1.09900");
    revealNext(e);
    expect(e.state.openPositions[0]?.stopLoss).toBe("1.10100");
    revealNext(e);
    expect(e.state.openPositions[0]?.stopLoss).toBe("1.10200");
    revealNext(e);
    expect(e.state.openPositions).toHaveLength(0);
    expect(e.state.closedTrades[0]?.exitReason).toBe("stop-loss");
    expect(e.state.closedTrades[0]?.exitPrice).toBe("1.10200");
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
    expect(e.state.openPositions).toHaveLength(0);
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
  it("captures entry and exit snapshots with planned and realized R", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10100", "1.10210", "1.10090", "1.10200"),
    ];
    const e = ctx(candles);
    placeOrder(e, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1.0",
      stopLoss: "1.09900",
      takeProfit: "1.10200",
    });
    const position = e.state.openPositions[0]!;
    expect(position.journal?.plannedRR).toBe("2.00");
    expect(position.journal?.beforeEntrySnapshot?.candles).toHaveLength(1);

    revealNext(e);
    const trade = e.state.closedTrades[0]!;
    expect(trade.journalId).toBe(position.journalId);
    expect(trade.journal?.realizedR).toBe("2.00");
    expect(trade.journal?.afterExitSnapshot?.capturedAt).toBe(1);
  });

  it("updates one logical journal across partial-close records", () => {
    const e = ctx(FLAT);
    placeOrder(e, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1",
      stopLoss: "1.09900",
      takeProfit: "1.10200",
    });
    const journalId = e.state.openPositions[0]!.journalId!;
    closePosition(e, undefined, "0.5");
    expect(updateTradeJournal(e, journalId, {
      entryReason: "London breakout",
      exitReview: "Followed the plan",
      setupTags: ["breakout", "breakout"],
      mistakeTags: [],
      emotion: "Calm",
      confidence: 4,
      ruleChecklist: [{ id: "risk", label: "Risk defined", followed: true }],
      validity: "valid",
    })).toBe(true);
    expect(e.state.openPositions[0]?.journal?.entryReason).toBe("London breakout");
    expect(e.state.closedTrades[0]?.journal?.setupTags).toEqual(["breakout"]);
  });

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

  it("persists intrabar favorable and adverse excursion for analytics", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.10000", "1.10300", "1.09700", "1.10100"),
    ];
    const e = ctx(candles);
    placeOrder(e, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1.0",
      stopLoss: "1.09000",
      takeProfit: "1.11000",
    });
    revealNext(e);

    const position = e.state.openPositions[0];
    expect(Number(position?.maxFavorablePnl)).toBeGreaterThan(0);
    expect(Number(position?.maxAdversePnl)).toBeLessThan(0);
    const favorable = position?.maxFavorablePnl;
    const adverse = position?.maxAdversePnl;
    closePosition(e, position?.id);

    expect(e.state.closedTrades[0]?.maxFavorablePnl).toBe(favorable);
    expect(e.state.closedTrades[0]?.maxAdversePnl).toBe(adverse);
    expect(Number(e.state.closedTrades[0]?.initialRiskAmount)).toBeGreaterThan(0);
  });

  it("partially closes a position and leaves the remainder open", () => {
    const e = ctx(FLAT);
    placeOrder(e, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1.0",
      stopLoss: "1.09900",
    });
    const id = e.state.openPositions[0]?.id;
    expect(closePosition(e, id, "0.5").ok).toBe(true);
    expect(e.state.closedTrades[0]?.lots).toBe("0.5");
    expect(e.state.openPositions[0]?.lots).toBe("0.5");
    expect(e.state.openPositions[0]?.initialRiskAmount).toBe("50.00");
  });

  it("tracks max drawdown from unrealised equity", () => {
    const candles = [
      c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
      c(1, "1.09000", "1.10010", "1.08990", "1.09000"),
      c(2, "1.10000", "1.10010", "1.08990", "1.10000"),
    ];
    const e = ctx(candles);
    placeOrder(e, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1.0",
      stopLoss: "1.08000",
      takeProfit: "1.12000",
    });
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
    expect(e.state.openPositions).toHaveLength(0);
    expect(e.state.balance).toBe("10000.00");
  });
});
