import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data/types";
import type { EngineContext, SessionConfig } from "./types";
import { createSessionState, fastForwardIdleTo, placeOrder, revealNext } from "./replay-engine";
import { exhaustedReplayPairs, focusedMarketResumeIndex, unexpectedReplayGap } from "./focused-market-resume";

const minute = 60_000;
// October 1: 16:14 -> 18:00 New York (UTC-4).
const start = Date.UTC(2026, 9, 1, 20, 14);
const bar = (timestamp: number, price = "1.1"): Candle => ({
  timestamp, open: price, high: price, low: price, close: price, volume: "1", source: "test",
});
function context(symbol = "USA30IDXUSD"): EngineContext {
  const candles = Array.from({ length: 108 }, (_, i) => bar(start + i * minute));
  const config: SessionConfig = {
    symbol: "EURUSD", baseCurrency: "EUR", quoteCurrency: "USD", timeframe: "1m",
    startTime: start, endTime: start + 107 * minute, startingBalance: "10000",
    accountCurrency: "USD", spreadPips: "0", commissionPerLot: "0", slippagePips: "0",
    executionPolicy: "conservative", pipSize: "0.0001", pricePrecision: 5, initialVisibleCount: 1,
  };
  return { candles, state: createSessionState("gap", config, candles.length, candles, "test", true),
    pairCandles: { [symbol]: [bar(start, "42000"), bar(start + 106 * minute, "41900"), bar(start + 107 * minute, "41901")] } };
}

describe("focused market closure replay", () => {
  it("detects a secondary tail before the primary runs out", () => {
    const ctx = context();
    ctx.pairCandles!.USA30IDXUSD = [bar(start)];
    expect(exhaustedReplayPairs(ctx, ["EURUSD", "USA30IDXUSD", "USA30IDXUSD"])).toEqual(["USA30IDXUSD"]);
    expect(ctx.state.visibleIndex).toBe(0);
  });
  it("does not flag a normal closure when the reopening candle is buffered", () => {
    expect(exhaustedReplayPairs(context(), ["USA30IDXUSD"])).toEqual([]);
  });
  it("checks every visible or traded pair, not only the focused market", () => {
    const ctx = context();
    ctx.pairCandles!.USATECHIDXUSD = [bar(start)];
    expect(exhaustedReplayPairs(ctx, ["USA30IDXUSD", "USATECHIDXUSD"])).toEqual(["USATECHIDXUSD"]);
    expect(exhaustedReplayPairs(ctx, ["unloaded"])).toEqual(["unloaded"]);
  });
  it("checks a complete manual step before jumping to its end", () => {
    const ctx = context();
    ctx.pairCandles!.USA30IDXUSD = [bar(start), bar(start + 10 * minute)];
    expect(exhaustedReplayPairs(ctx, ["USA30IDXUSD"], 30)).toEqual(["USA30IDXUSD"]);
  });
  it("does not skip an open forex chart when a visible index is closed", () => {
    const ctx=context();
    expect(focusedMarketResumeIndex(ctx,"USA30IDXUSD",["EURUSD","USA30IDXUSD"])).toBeNull();
  });
  it("skips a shared closure for two indices without skipping another market's candles", () => {
    const ctx=context();
    ctx.pairCandles!.USATECHIDXUSD=structuredClone(ctx.pairCandles!.USA30IDXUSD!);
    expect(focusedMarketResumeIndex(ctx,"USA30IDXUSD",["USA30IDXUSD","USATECHIDXUSD"])).toBe(106);
    ctx.pairCandles!.USATECHIDXUSD!.splice(1,0,bar(start+10*minute));
    expect(focusedMarketResumeIndex(ctx,"USA30IDXUSD",["USA30IDXUSD","USATECHIDXUSD"])).toBeNull();
  });
  it("does not skip while a second visible market is still loading", () => {
    const ctx=context();
    expect(focusedMarketResumeIndex(ctx,"USA30IDXUSD",["USA30IDXUSD","USATECHIDXUSD"])).toBeNull();
  });
  it("pauses on the July 16 to July 29 primary data hole even when US30 has data", () => {
    const ctx = context();
    ctx.candles[1] = bar(Date.UTC(2026, 6, 29, 20, 59));
    ctx.candles[0] = bar(Date.UTC(2026, 6, 16, 22, 41));
    expect(unexpectedReplayGap(ctx, "USA30IDXUSD")?.symbol).toBe("EURUSD");
    expect(focusedMarketResumeIndex(ctx, "USA30IDXUSD")).toBeNull();
    expect(ctx.state.visibleIndex).toBe(0);
  });
  it("never treats a multi-week secondary data hole as a scheduled closure", () => {
    const ctx = context();
    ctx.pairCandles!.USA30IDXUSD = [bar(start), bar(start + 13 * 86400000)];
    expect(unexpectedReplayGap(ctx, "USA30IDXUSD")?.symbol).toBe("USA30IDXUSD");
    expect(focusedMarketResumeIndex(ctx, "USA30IDXUSD")).toBeNull();
  });
  it.each(["USA30IDXUSD", "USATECHIDXUSD"])("skips %s from 16:14 to its actual 18:00 reopening", symbol => {
    const ctx = context(symbol);
    const target = focusedMarketResumeIndex(ctx, symbol);
    expect(target).toBe(106);
    expect(fastForwardIdleTo(ctx, target!)).toBe(true);
    expect(ctx.candles[ctx.state.visibleIndex]!.timestamp).toBe(Date.UTC(2026, 9, 1, 22));
    expect(focusedMarketResumeIndex(ctx, symbol)).toBeNull();
  });

  it("does not skip ordinary minutes or the primary chart", () => {
    const ctx = context();
    expect(focusedMarketResumeIndex(ctx, "EURUSD")).toBeNull();
    ctx.pairCandles!.USA30IDXUSD!.splice(1, 0, bar(start + minute));
    expect(focusedMarketResumeIndex(ctx, "USA30IDXUSD")).toBeNull();
  });

  it("does not mistake an unloaded market tail or primary buffer for a closure", () => {
    const ctx = context();
    ctx.candles = ctx.candles.slice(0, 50);
    expect(focusedMarketResumeIndex(ctx, "USA30IDXUSD")).toBeNull();
    ctx.pairCandles!.USA30IDXUSD = [bar(start)];
    expect(focusedMarketResumeIndex(ctx, "USA30IDXUSD")).toBeNull();
    expect(focusedMarketResumeIndex(ctx, "missing")).toBeNull();
  });

  it("still stops an open forex trade inside the index closure", () => {
    const ctx = context();
    ctx.candles[16] = { ...ctx.candles[16]!, low: "1.09", close: "1.09" };
    placeOrder(ctx, { direction: "long", sizingMode: "fixed-lots", lots: "0.1", stopLoss: "1.095" });
    const target = focusedMarketResumeIndex(ctx, "USA30IDXUSD")!;
    expect(fastForwardIdleTo(ctx, target)).toBe(false);
    while (ctx.state.visibleIndex < target) revealNext(ctx);
    expect(ctx.state.closedTrades).toHaveLength(1);
    expect(ctx.state.closedTrades[0]!.exitTime).toBe(start + 16 * minute);
    expect(ctx.state.closedTrades[0]!.exitReason).toBe("stop-loss");
    expect(ctx.state.visibleIndex).toBe(106);
  });

  it("still fills pending orders during the skipped display interval", () => {
    const ctx = context();
    ctx.candles[10] = { ...ctx.candles[10]!, low: "1.09", close: "1.09" };
    placeOrder(ctx, { direction: "long", orderType: "limit", entryPrice: "1.095", sizingMode: "fixed-lots", lots: "0.1" });
    const target = focusedMarketResumeIndex(ctx, "USATECHIDXUSD");
    expect(target).toBeNull();
    const resume = focusedMarketResumeIndex(ctx, "USA30IDXUSD")!;
    expect(fastForwardIdleTo(ctx, resume)).toBe(false);
    while (ctx.state.visibleIndex < resume) revealNext(ctx);
    expect(ctx.state.openPositions).toHaveLength(1);
    expect(ctx.state.openPositions[0]!.entryTime).toBe(start + 10 * minute);
  });
});
