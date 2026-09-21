import { describe, expect, it } from "vitest";
import { d } from "@/lib/decimal";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import type { Candle } from "@/lib/market-data/types";
import { accountMargin } from "@/components/app/AccountSummary";
import { sizeSummaryFor } from "@/components/app/LotSizePopover";
import { calculatePositionSize, marginRequired, pipValuePerLot } from "./position-sizing";
import { closePosition, createSessionState, placeOrder, publicSessionState, revealNext } from "./replay-engine";
import { tradePlanMetrics } from "./trade-plan";
import type { EngineContext, SessionConfig } from "./types";

const cases = [
  { symbol: "XAUUSD", entry: "3400", exit: "3450", stop: "3350", profit: "50.00", margin: "34.00", value: "3400.00", riskLots: "0.02" },
  { symbol: "XAGUSD", entry: "30", exit: "31", stop: "29", profit: "50.00", margin: "15.00", value: "1500.00", riskLots: "0.02" },
  { symbol: "BTCUSD", entry: "60000", exit: "61000", stop: "59000", profit: "10.00", margin: "6.00", value: "600.00", riskLots: "0.10" },
  { symbol: "USA30IDXUSD", entry: "53200", exit: "53300", stop: "53100", profit: "1.00", margin: "5.32", value: "532.00", riskLots: "1.00" },
  { symbol: "USATECHIDXUSD", entry: "29400", exit: "29500", stop: "29300", profit: "1.00", margin: "2.94", value: "294.00", riskLots: "1.00" },
];

function engine(symbol: string, prices: string[], secondary = false): EngineContext {
  const definition = getSymbolDefinition(secondary ? "EURUSD" : symbol)!;
  const config: SessionConfig = {
    symbol: definition.symbol, symbols: secondary ? ["EURUSD", symbol] : [symbol],
    baseCurrency: definition.baseCurrency, quoteCurrency: definition.quoteCurrency,
    pipSize: definition.pipSize, pricePrecision: definition.pricePrecision,
    timeframe: "1m", startTime: 1000, endTime: 3000, startingBalance: "10000",
    accountCurrency: "USD", spreadPips: "0", commissionPerLot: "0", slippagePips: "0",
    executionPolicy: "conservative", initialVisibleCount: 1, leverage: "100",
  };
  const candlesFor = (values: string[]): Candle[] => values.map((price, i) => ({
    timestamp: (i + 1) * 1000, open: price, high: price, low: price, close: price, source: "test",
  }));
  const candles = candlesFor(secondary ? prices.map(() => "1.1") : prices);
  return { candles, pairCandles: secondary ? { [symbol]: candlesFor(prices) } : undefined,
    state: createSessionState("contract-test", config, candles.length, candles, "test", false) };
}

describe.each(cases)("$symbol contract", (example) => {
  it.each([false, true])("calculates live and realized profit on 0.01 lot (secondary=%s)", (secondary) => {
    const ctx = engine(example.symbol, [example.entry, example.exit, example.exit], secondary);
    expect(placeOrder(ctx, { symbol: example.symbol, direction: "long", sizingMode: "fixed-lots", lots: "0.01" }).ok).toBe(true);
    expect(accountMargin(publicSessionState(ctx))).toBe(Number(example.margin));
    revealNext(ctx);
    expect(ctx.state.equity).toBe(d(10000).plus(example.profit).toFixed(2));
    expect(closePosition(ctx).ok).toBe(true);
    expect(ctx.state.closedTrades[0]!.pnl).toBe(example.profit);
    expect(ctx.state.balance).toBe(d(10000).plus(example.profit).toFixed(2));
  });

  it("uses the same contract for risk sizing, order preview and the lot-size popover", () => {
    const ctx = engine(example.symbol, [example.entry, example.exit]);
    const state = publicSessionState(ctx);
    const preview = tradePlanMetrics({ state, sizingMode: "fixed-lots", lots: "0.01", plan: {
      direction: "long", entryPrice: example.entry, stopLoss: example.stop, takeProfit: example.exit,
    } });
    expect(preview.riskAmount).toBe(example.profit);
    expect(preview.projectedProfit).toBe(example.profit);
    expect(preview.tradeValue).toBe(example.value);
    expect(preview.margin).toBe(example.margin);
    expect(sizeSummaryFor(state, "0.01").margin).toBe(Number(example.margin));
    const sized = calculatePositionSize({ ...state.config, accountBalance: "10000", riskPercent: "1", entryPrice: example.entry, stopLoss: example.stop });
    expect(sized.lots).toBe(example.riskLots);
    expect(sized.maxExpectedLoss).toBe("100.00");
  });

  it("handles shorts, partial closes and commission without multiplying by leverage", () => {
    const ctx = engine(example.symbol, [example.exit, example.entry, example.entry]);
    ctx.state.config.leverage = "500";
    ctx.state.config.commissionPerLot = "10";
    expect(placeOrder(ctx, { direction: "short", sizingMode: "fixed-lots", lots: "0.02" }).ok).toBe(true);
    revealNext(ctx);
    expect(closePosition(ctx, undefined, "0.01").ok).toBe(true);
    expect(ctx.state.openPositions).toHaveLength(1);
    expect(closePosition(ctx).ok).toBe(true);
    expect(ctx.state.closedTrades.reduce((sum, t) => sum.plus(t.pnl), d(0)).toFixed(2))
      .toBe(d(example.profit).times(2).minus("0.20").toFixed(2));
  });

  it("realizes the correct stop-loss loss", () => {
    const ctx = engine(example.symbol, [example.entry, example.stop, example.stop]);
    expect(placeOrder(ctx, { direction: "long", sizingMode: "fixed-lots", lots: "0.01", stopLoss: example.stop }).ok).toBe(true);
    revealNext(ctx);
    expect(ctx.state.closedTrades[0]!.pnl).toBe(d(example.profit).negated().toFixed(2));
  });
});

it("keeps standard forex contracts unchanged", () => {
  expect(pipValuePerLot({ symbol: "EURUSD", baseCurrency: "EUR", quoteCurrency: "USD", accountCurrency: "USD", pipSize: "0.0001", price: "1.1" }).value).toBe("10.00");
  expect(marginRequired({ baseCurrency: "EUR", quoteCurrency: "USD", accountCurrency: "USD", price: "1.1", lots: "1", leverage: "100" }).value).toBe("1100.00");
});
