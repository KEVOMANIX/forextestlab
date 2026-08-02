import { describe, expect, it } from "vitest";

import { createSessionState, revealNext } from "./replay-engine";
import type { EngineContext, SessionConfig } from "./types";
import type { Candle } from "@/lib/market-data/types";

/**
 * Reveal throughput, which is what a "Go to" jump spends its time on.
 *
 * A jump reveals every candle between here and the target so fills stay honest,
 * so the per-candle cost sets the wait. This guards the order of magnitude, not
 * a precise number: a month of 1-minute data is roughly 30,000 candles and has
 * to feel like a moment, not a load.
 */

const START = Date.UTC(2024, 0, 1);

function series(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const open = 1.08 + index * 0.000001;
    return {
      timestamp: START + index * 60_000,
      open: open.toFixed(5),
      high: (open + 0.0001).toFixed(5),
      low: (open - 0.0001).toFixed(5),
      close: (open + 0.00002).toFixed(5),
      volume: "10",
      source: "bench",
    };
  });
}

function context(candles: Candle[]): EngineContext {
  const config: SessionConfig = {
    name: "bench",
    symbol: "EURUSD",
    symbols: ["EURUSD"],
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "1m",
    startTime: START,
    endTime: candles.at(-1)!.timestamp,
    startingBalance: "10000.00",
    accountCurrency: "USD",
    spreadPips: "1.0",
    commissionPerLot: "0.00",
    slippagePips: "0.0",
    executionPolicy: "conservative",
    pipSize: "0.0001",
    pricePrecision: 5,
    initialVisibleCount: 60,
  } as SessionConfig;
  return {
    state: createSessionState("bench", config, candles.length, candles, "bench", false),
    candles,
  };
}

describe("reveal throughput on a flat account", () => {
  it("reveals a month of 1-minute candles well inside a second", () => {
    const candles = series(30_000);
    const ctx = context(candles);
    const startedAt = performance.now();
    let revealed = 0;
    while (revealNext(ctx)) revealed += 1;
    const elapsed = performance.now() - startedAt;

    expect(revealed).toBeGreaterThan(29_000);
    // Generous enough not to flake on a loaded CI box, tight enough to catch a
    // regression that would make a month-long jump feel like a page load.
    expect(elapsed).toBeLessThan(1_500);
  });

  it("does not grow the equity curve while nothing is open", () => {
    const candles = series(5_000);
    const ctx = context(candles);
    while (revealNext(ctx)) {
      /* advance to the end */
    }
    // With no position and no balance change there is one flat line to record,
    // not one point per candle: the curve is read as a chart, and 5,000
    // identical points cost memory, payload and render time to say nothing.
    expect(ctx.state.equityCurve.length).toBeLessThan
      (200);
  });
});
