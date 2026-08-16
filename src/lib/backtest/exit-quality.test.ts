import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import type { ClosedTrade } from "@/lib/backtest/types";
import {
  summariseExcursions,
  summarisePlanTests,
  testTradePlan,
  tradeExcursion,
  tradePlanTestable,
  planTestable,
  type PlanConfig,
  type PlanTest,
} from "./exit-quality";

const CONFIG: PlanConfig = {
  spreadPips: "0",
  pipSize: "0.0001",
  quoteCurrency: "USD",
  accountCurrency: "USD",
  baseCurrency: "EUR",
  symbol: "EURUSD",
  executionPolicy: "conservative",
};

function candle(
  timestamp: number,
  open: string,
  high: string,
  low: string,
  close: string,
): Candle {
  return { timestamp, open, high, low, close, source: "test" };
}

/**
 * A 1.00 lot EUR/USD long from 1.10000 with a 20-pip stop. At $10 a pip that
 * is $200 of risk, so 20 pips of movement is exactly 1R and the arithmetic
 * below can be read off the prices.
 */
function trade(patch: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: "t1",
    symbol: "EURUSD",
    direction: "long",
    entryPrice: "1.10000",
    exitPrice: "1.10100",
    entryTime: 1_000,
    exitTime: 5_000,
    entryIndex: 0,
    exitIndex: 4,
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
    ...patch,
  };
}

describe("tier 1 — excursion inside the trade", () => {
  it("reads peak, trough and give-back off what the engine already recorded", () => {
    const result = tradeExcursion(
      trade({ maxFavorablePnl: "480.00", maxAdversePnl: "-120.00", pnl: "100.00" }),
    );
    expect(result.peakR).toBeCloseTo(2.4, 5);
    expect(result.troughR).toBeCloseTo(-0.6, 5);
    expect(result.capturedR).toBeCloseTo(0.5, 5);
    expect(result.giveBackR).toBeCloseTo(1.9, 5);
  });

  it("refuses to invent an R for a trade that defined no risk", () => {
    const result = tradeExcursion(
      trade({ initialRiskAmount: null, maxFavorablePnl: "480.00" }),
    );
    expect(result).toEqual({
      peakR: null,
      troughR: null,
      capturedR: null,
      giveBackR: null,
    });
  });

  it("never reports a negative give-back", () => {
    // Closed above its recorded peak, which partial fills can produce.
    const result = tradeExcursion(
      trade({ maxFavorablePnl: "50.00", maxAdversePnl: "0", pnl: "100.00" }),
    );
    expect(result.giveBackR).toBe(0);
  });
});

describe("tier 1 — session summary", () => {
  it("counts a trade that peaked and then lost as capturing none of it", () => {
    const summary = summariseExcursions([
      trade({ id: "a", maxFavorablePnl: "400.00", maxAdversePnl: "-40.00", pnl: "200.00" }),
      trade({ id: "b", maxFavorablePnl: "400.00", maxAdversePnl: "-300.00", pnl: "-200.00" }),
    ]);
    // 200 banked out of 800 that was on the table.
    expect(summary.captureRate).toBeCloseTo(0.25, 5);
    expect(summary.tested).toBe(2);
  });

  it("averages how far winners went against you first", () => {
    const summary = summariseExcursions([
      trade({ id: "a", maxFavorablePnl: "400.00", maxAdversePnl: "-100.00", pnl: "200.00" }),
      trade({ id: "b", maxFavorablePnl: "400.00", maxAdversePnl: "-300.00", pnl: "200.00" }),
      // A loser must not drag the winners' figure around.
      trade({ id: "c", maxFavorablePnl: "40.00", maxAdversePnl: "-400.00", pnl: "-200.00" }),
    ]);
    expect(summary.averageWinnerTroughR).toBeCloseTo(-1, 5);
  });

  it("counts trades that handed back more than a full R", () => {
    const summary = summariseExcursions([
      trade({ id: "a", maxFavorablePnl: "600.00", maxAdversePnl: "0", pnl: "100.00" }),
      trade({ id: "b", maxFavorablePnl: "120.00", maxAdversePnl: "0", pnl: "100.00" }),
    ]);
    expect(summary.gaveBackOverOneR).toBe(1);
  });

  it("has nothing to say about trades with no recorded excursion", () => {
    const summary = summariseExcursions([trade()]);
    expect(summary.tested).toBe(0);
    expect(summary.captureRate).toBeNull();
  });
});

describe("tier 2 — testability", () => {
  it("only runs on a finished session", () => {
    expect(planTestable({ status: "finished" })).toBe(true);
    expect(planTestable({ status: "running" })).toBe(false);
    expect(planTestable({ status: "paused" })).toBe(false);
  });

  it("only asks the question of trades that were cut by hand", () => {
    expect(tradePlanTestable(trade({ exitReason: "manual" }))).toBe(true);
    expect(tradePlanTestable(trade({ exitReason: "stop-loss" }))).toBe(false);
    expect(tradePlanTestable(trade({ exitReason: "take-profit" }))).toBe(false);
    expect(tradePlanTestable(trade({ initialRiskAmount: null }))).toBe(false);
    expect(
      tradePlanTestable(
        trade({ initialStopLoss: null, initialTakeProfit: null }),
      ),
    ).toBe(false);
  });
});

describe("tier 2 — what the untouched plan would have done", () => {
  it("pays the original target when price gets there", () => {
    const result = testTradePlan(
      trade({ pnl: "100.00" }),
      [
        candle(1_000, "1.10000", "1.10100", "1.09950", "1.10050"),
        candle(2_000, "1.10050", "1.10300", "1.10000", "1.10250"),
        candle(3_000, "1.10250", "1.10650", "1.10200", "1.10600"),
      ],
      CONFIG,
    )!;
    expect(result.outcome).toBe("take-profit");
    // 60 pips on a 20-pip stop is 3R.
    expect(result.planR).toBeCloseTo(3, 5);
    expect(result.capturedR).toBeCloseTo(0.5, 5);
    expect(result.deltaR).toBeCloseTo(2.5, 5);
    expect(result.candles).toBe(3);
  });

  it("credits a cut that dodged the stop", () => {
    const result = testTradePlan(
      trade({ pnl: "100.00" }),
      [
        candle(1_000, "1.10000", "1.10100", "1.09950", "1.10050"),
        candle(2_000, "1.10050", "1.10060", "1.09790", "1.09800"),
      ],
      CONFIG,
    )!;
    expect(result.outcome).toBe("stop-loss");
    expect(result.planR).toBeCloseTo(-1, 5);
    // Taking +0.5R instead of -1R saved 1.5R, so the delta is negative.
    expect(result.deltaR).toBeCloseTo(-1.5, 5);
  });

  it("records the peak reached before the plan resolved", () => {
    const result = testTradePlan(
      trade({ pnl: "100.00" }),
      [
        // Ran to +2R before turning around and stopping out.
        candle(1_000, "1.10000", "1.10400", "1.09950", "1.10350"),
        candle(2_000, "1.10350", "1.10360", "1.09790", "1.09800"),
      ],
      CONFIG,
    )!;
    expect(result.peakR).toBeCloseTo(2, 5);
    expect(result.outcome).toBe("stop-loss");
  });

  it("says so rather than guessing when the data runs out", () => {
    const result = testTradePlan(
      trade({ pnl: "100.00" }),
      [candle(1_000, "1.10000", "1.10100", "1.09950", "1.10050")],
      CONFIG,
    )!;
    expect(result.outcome).toBe("unresolved");
    expect(result.planR).toBeCloseTo(0.25, 5);
  });

  it("ignores candles before the entry", () => {
    const result = testTradePlan(
      trade({ entryTime: 2_000, pnl: "100.00" }),
      [
        // Would have hit the stop, but it is before the trade existed.
        candle(1_000, "1.10000", "1.10000", "1.09700", "1.09800"),
        candle(2_000, "1.10000", "1.10650", "1.09990", "1.10600"),
      ],
      CONFIG,
    )!;
    expect(result.outcome).toBe("take-profit");
  });

  it("lets the session's execution policy settle a candle touching both levels", () => {
    const both = [candle(1_000, "1.10000", "1.10650", "1.09790", "1.10000")];
    const conservative = testTradePlan(trade(), both, CONFIG)!;
    expect(conservative.outcome).toBe("stop-loss");
    expect(conservative.intrabarAmbiguous).toBe(true);

    const optimistic = testTradePlan(trade(), both, {
      ...CONFIG,
      executionPolicy: "optimistic",
    })!;
    expect(optimistic.outcome).toBe("take-profit");
    expect(optimistic.intrabarAmbiguous).toBe(true);
  });

  it("handles a short the same way round", () => {
    const result = testTradePlan(
      trade({
        direction: "short",
        entryPrice: "1.10000",
        initialStopLoss: "1.10200",
        initialTakeProfit: "1.09400",
        stopLoss: "1.10200",
        takeProfit: "1.09400",
        pnl: "100.00",
      }),
      [candle(1_000, "1.10000", "1.10050", "1.09390", "1.09400")],
      CONFIG,
    )!;
    expect(result.outcome).toBe("take-profit");
    expect(result.planR).toBeCloseTo(3, 5);
  });

  it("returns nothing when the trade had no plan to test", () => {
    expect(
      testTradePlan(
        trade({ initialStopLoss: null, initialTakeProfit: null }),
        [candle(1_000, "1.1", "1.1", "1.1", "1.1")],
        CONFIG,
      ),
    ).toBeNull();
    expect(testTradePlan(trade(), [], CONFIG)).toBeNull();
  });
});

describe("tier 2 — session summary", () => {
  const test = (patch: Partial<PlanTest>): PlanTest => ({
    tradeId: "t",
    outcome: "take-profit",
    planR: 2,
    capturedR: 0.5,
    deltaR: 1.5,
    peakR: 2,
    troughR: -0.3,
    candles: 10,
    intrabarAmbiguous: false,
    ...patch,
  });

  it("nets the cost of cutting against the times it saved you", () => {
    const summary = summarisePlanTests([
      test({ deltaR: 1.5 }),
      test({ deltaR: 2 }),
      test({ deltaR: -1.5, outcome: "stop-loss", planR: -1, peakR: 0.4 }),
    ]);
    expect(summary.netDeltaR).toBeCloseTo(2, 5);
    expect(summary.cutEarly).toBe(2);
    expect(summary.cutWell).toBe(1);
    expect(summary.stoppedOut).toBe(1);
    expect(summary.reachedTarget).toBe(2);
  });

  it("builds a ladder from the peak each trade actually reached", () => {
    const summary = summarisePlanTests([
      test({ peakR: 2.5, planR: 2, outcome: "take-profit" }),
      test({ peakR: 1.2, planR: 2, outcome: "take-profit" }),
      test({ peakR: 0.3, planR: -1, outcome: "stop-loss" }),
    ]);
    const rung = (target: number) =>
      summary.ladder.find((entry) => entry.target === target)!;

    // A 1R target: reached by the first two, stopped on the third.
    expect(rung(1).hit).toBe(2);
    expect(rung(1).netR).toBeCloseTo(1 + 1 - 1, 5);
    // A 2R target: only the first gets there.
    expect(rung(2).hit).toBe(1);
    expect(rung(2).netR).toBeCloseTo(2 + 2 - 1, 5);
    // A 3R target: nobody, so everything falls back to what it did.
    expect(rung(3).hit).toBe(0);
    expect(rung(3).netR).toBeCloseTo(2 + 2 - 1, 5);
  });
});
