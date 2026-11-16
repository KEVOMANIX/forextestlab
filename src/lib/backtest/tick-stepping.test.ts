import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import type { EngineContext, SessionConfig } from "./types";
import {
  advanceIntrabar,
  advanceReplayTo,
  createSessionState,
  currentCandle,
  placeOrder,
  publicSessionState,
  revealNext,
  stepBackTo,
} from "./replay-engine";
import { candleBetween } from "./intrabar";

const MINUTE = 60_000;
const config: SessionConfig = {
  symbol: "EURUSD", baseCurrency: "EUR", quoteCurrency: "USD", timeframe: "1m", startTime: 0, endTime: 0,
  startingBalance: "10000", accountCurrency: "USD", spreadPips: "0", commissionPerLot: "0", slippagePips: "0",
  executionPolicy: "conservative", pipSize: "0.0001", pricePrecision: 5, initialVisibleCount: 1,
};
const c = (ts: number, o: string, h: string, l: string, cl: string, path?: Candle["path"]): Candle => ({ timestamp: ts, open: o, high: h, low: l, close: cl, source: "test", path });
// Minute 1 goes up to 1.1012 first, then down to 1.0985, then closes at 1.1000.
const upThenDown = { t: [0, 15_000, 30_000, 45_000, 59_999], p: [1.1, 1.1012, 1.1004, 1.0985, 1.1] };
const candles = () => [
  c(0, "1.10000", "1.10010", "1.09990", "1.10000"),
  c(MINUTE, "1.10000", "1.10120", "1.09850", "1.10000", upThenDown),
  c(2 * MINUTE, "1.10000", "1.10010", "1.09990", "1.10000"),
];
const ctx = (): EngineContext => {
  const list = candles();
  return { candles: list, state: createSessionState("s1", config, list.length, list, "test", true) };
};

describe("candle pieces", () => {
  it("cuts a candle's path at any time, interpolating the ends", () => {
    const piece = candleBetween(candles()[1]!, 7_500, 30_000, 5)!;
    expect(piece).toMatchObject({ open: "1.10060", high: "1.10120", low: "1.10040", close: "1.10040" });
    expect(piece.path!.t).toEqual([7_500, 15_000, 30_000]);
  });
});

describe("tick stepping", () => {
  it("reveals part of the minute: the price is the price at that tick, and the rest stays hidden", () => {
    const e = ctx();
    expect(advanceIntrabar(e, 15_000)).toBe(true);
    expect(e.state.visibleIndex).toBe(1);
    expect(currentCandle(e)).toMatchObject({ open: "1.10000", high: "1.10120", low: "1.10000", close: "1.10120" });
    expect(publicSessionState(e)).toMatchObject({ currentPrice: "1.10120", currentTime: MINUTE + 15_000, intrabarMs: 15_000 });
  });

  it("fills a market order at the tick price, and only later ticks can stop it", () => {
    const e = ctx();
    advanceIntrabar(e, 15_000);
    // Long at the top of the move, stop 1.0990: the low at 45s takes it out.
    placeOrder(e, { direction: "long", orderType: "market", stopLoss: "1.09900", sizingMode: "fixed-lots", lots: "0.1" });
    expect(e.state.openPositions[0]?.entryPrice).toBe("1.10120");
    advanceIntrabar(e, 30_000);
    expect(e.state.openPositions).toHaveLength(1);
    advanceIntrabar(e, 45_000);
    expect(e.state.closedTrades[0]).toMatchObject({ exitReason: "stop-loss", exitPrice: "1.09900" });
  });

  it("does not let a short opened after the high be stopped by that high", () => {
    const e = ctx();
    advanceIntrabar(e, 30_000);
    placeOrder(e, { direction: "short", orderType: "market", stopLoss: "1.10100", takeProfit: "1.09900", sizingMode: "fixed-lots", lots: "0.1" });
    expect(e.state.openPositions[0]?.entryPrice).toBe("1.10040");
    revealNext(e); // completes the minute: only 30s→60s is left, which reaches the target
    expect(e.state.intrabarMs).toBeNull();
    expect(e.state.visibleIndex).toBe(1);
    expect(e.state.closedTrades[0]).toMatchObject({ exitReason: "take-profit", exitPrice: "1.09900" });
  });

  it("the server reproduces the same result from the action's index and tick position", () => {
    const browser = ctx();
    advanceIntrabar(browser, 30_000);
    placeOrder(browser, { direction: "short", orderType: "market", sizingMode: "fixed-lots", lots: "0.1" });
    const server = ctx();
    advanceReplayTo(server, 1, 30_000);
    placeOrder(server, { direction: "short", orderType: "market", sizingMode: "fixed-lots", lots: "0.1" });
    expect(server.state.openPositions[0]?.entryPrice).toBe(browser.state.openPositions[0]?.entryPrice);
    // A later action for the next candle completes the minute first.
    advanceReplayTo(server, 2);
    revealNext(browser); revealNext(browser);
    expect(server.state.visibleIndex).toBe(2);
    expect(server.state.equity).toBe(browser.state.equity);
  });

  it("needs a tick path and a time ahead of the replay", () => {
    const e = ctx();
    advanceIntrabar(e, 30_000);
    expect(advanceIntrabar(e, 20_000)).toBe(false);
    revealNext(e);
    expect(advanceIntrabar(e, 10_000)).toBe(false); // minute 2 has no ticks
  });

  it("stepping back drops the part-revealed minute", () => {
    const e = ctx();
    advanceIntrabar(e, 30_000);
    expect(stepBackTo(e, 0)).toBe(true);
    expect(e.state.intrabarMs).toBeNull();
    expect(currentCandle(e)?.timestamp).toBe(0);
  });
});
