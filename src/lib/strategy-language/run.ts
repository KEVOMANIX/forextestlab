import { Decimal, d } from "@/lib/decimal";
import { checkStopTakeProfit, commissionForLots, computePnl, deriveBidAsk, exitFillPrice } from "@/lib/backtest/execution";
import { calculatePositionSize, pipValuePerLot } from "@/lib/backtest/position-sizing";
import type { TradeDirection } from "@/lib/backtest/types";
import type { Candle } from "@/lib/market-data/types";
import type { SymbolDefinition } from "@/lib/market-data/symbols";
import type { Indicator, Operand, StrategyProgram, StrategySignal } from "./parser";

export interface StrategyTrade {
  number: number;
  direction: TradeDirection;
  entryTime: number;
  exitTime: number;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  lots: string;
  pnl: string;
  r: string;
  reason: "stop-loss" | "take-profit" | "end-of-test";
  intrabarAmbiguous: boolean;
}
export interface StrategyReport {
  name: string;
  timeframe: StrategyProgram["timeframe"];
  bars: number;
  startingBalance: string;
  endingBalance: string;
  netPnl: string;
  winRate: number;
  profitFactor: number | null;
  maxDrawdown: string;
  trades: StrategyTrade[];
  equity: { time: number; balance: number }[];
  skippedSignals: number;
  crossCurrencyApprox: boolean;
  dataSource: string;
  assumptions: { spreadPips: string; slippagePips: string; commissionPerLot: string; executionPolicy: "conservative" };
}
export interface StrategyRunOptions {
  symbol: SymbolDefinition;
  startTime: number;
  startingBalance: string;
  spreadPips: string;
  slippagePips: string;
  commissionPerLot: string;
}

function indicatorKey(indicator: Indicator): string {
  return indicator.kind === "CLOSE" ? "CLOSE" : `${indicator.kind}:${indicator.period}`;
}

/** NaN means the indicator has not accumulated enough prior CLOSED candles. */
function indicatorSeries(indicator: Indicator, candles: Candle[]): number[] {
  const closes = candles.map(candle => Number(candle.close));
  if (indicator.kind === "CLOSE") return closes;
  const output = Array<number>(closes.length).fill(NaN);
  const period = indicator.period;
  if (closes.length < period) return output;
  if (indicator.kind === "SMA") {
    let sum = 0;
    for (let i = 0; i < closes.length; i++) {
      sum += closes[i]!;
      if (i >= period) sum -= closes[i - period]!;
      if (i >= period - 1) output[i] = sum / period;
    }
  } else if (indicator.kind === "EMA") {
    const seed = closes.slice(0, period).reduce((sum, close) => sum + close, 0) / period;
    output[period - 1] = seed;
    const alpha = 2 / (period + 1);
    for (let i = period; i < closes.length; i++) output[i] = alpha * closes[i]! + (1 - alpha) * output[i - 1]!;
  } else {
    if (closes.length <= period) return output;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = closes[i]! - closes[i - 1]!;
      gains += Math.max(0, change);
      losses += Math.max(0, -change);
    }
    gains /= period;
    losses /= period;
    const value = () => gains === 0 && losses === 0 ? 50 : losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    output[period] = value();
    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i]! - closes[i - 1]!;
      gains = (gains * (period - 1) + Math.max(0, change)) / period;
      losses = (losses * (period - 1) + Math.max(0, -change)) / period;
      output[i] = value();
    }
  }
  return output;
}

function evaluateSignal(signal: StrategySignal, index: number, series: Map<string, number[]>): boolean {
  const value = (operand: Operand, i: number): number => operand.kind === "NUMBER" ? operand.value : series.get(indicatorKey(operand))?.[i] ?? NaN;
  const left = value(signal.left, index);
  const right = value(signal.right, index);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (signal.comparison === "ABOVE") return left > right;
  if (signal.comparison === "BELOW") return left < right;
  const beforeLeft = value(signal.left, index - 1);
  const beforeRight = value(signal.right, index - 1);
  if (!Number.isFinite(beforeLeft) || !Number.isFinite(beforeRight)) return false;
  return signal.comparison === "CROSSES ABOVE"
    ? beforeLeft <= beforeRight && left > right
    : beforeLeft >= beforeRight && left < right;
}

export function runStrategy(program: StrategyProgram, candles: Candle[], options: StrategyRunOptions): StrategyReport {
  if (candles.length > 5_000) throw new Error("A strategy test is limited to 5,000 candles.");
  if (candles.some((candle, i) => !Number.isFinite(Number(candle.close)) || (i > 0 && candle.timestamp <= candles[i - 1]!.timestamp))) throw new Error("Market candles must have valid prices in time order.");
  const { symbol } = options;
  const series = new Map<string, number[]>();
  for (const signal of program.signals) for (const operand of [signal.left, signal.right]) {
    if (operand.kind === "NUMBER") continue;
    const key = indicatorKey(operand);
    if (!series.has(key)) series.set(key, indicatorSeries(operand, candles));
  }
  const trades: StrategyTrade[] = [];
  const equity: StrategyReport["equity"] = [{ time: options.startTime, balance: Number(options.startingBalance) }];
  let balance = d(options.startingBalance);
  let peak = balance;
  let maxDrawdown = d(0);
  let grossProfit = d(0);
  let grossLoss = d(0);
  let skippedSignals = 0;
  let crossCurrencyApprox = false;
  let pending: StrategySignal | null = null;
  let position: { direction: TradeDirection; entryTime: number; entryPrice: string; stopLoss: string; takeProfit: string; lots: string; riskAmount: Decimal; commission: string } | null = null;

  const close = (candle: Candle, exitPrice: string, reason: StrategyTrade["reason"], intrabarAmbiguous = false) => {
    if (!position) return;
    const current = position;
    const pipValue = pipValuePerLot({ pipSize: symbol.pipSize, quoteCurrency: symbol.quoteCurrency, baseCurrency: symbol.baseCurrency, accountCurrency: "USD", price: exitPrice, symbol: symbol.symbol });
    crossCurrencyApprox ||= pipValue.approx;
    const { pnl } = computePnl({ direction: current.direction, entryPrice: current.entryPrice, exitPrice, lots: current.lots, pipSize: symbol.pipSize, pipValueAccountPerLot: pipValue.value, commission: current.commission });
    const amount = d(pnl);
    balance = balance.plus(amount);
    if (amount.gt(0)) grossProfit = grossProfit.plus(amount);
    if (amount.lt(0)) grossLoss = grossLoss.plus(amount.abs());
    peak = Decimal.max(peak, balance);
    maxDrawdown = Decimal.max(maxDrawdown, peak.minus(balance));
    trades.push({ number: trades.length + 1, direction: current.direction, entryTime: current.entryTime, exitTime: candle.timestamp, entryPrice: current.entryPrice, exitPrice: d(exitPrice).toFixed(symbol.pricePrecision), stopLoss: current.stopLoss, takeProfit: current.takeProfit, lots: current.lots, pnl, r: current.riskAmount.gt(0) ? amount.div(current.riskAmount).toFixed(2) : "0.00", reason, intrabarAmbiguous });
    equity.push({ time: candle.timestamp, balance: Number(balance.toFixed(2)) });
    position = null;
  };

  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index]!;
    if (candle.timestamp < options.startTime) continue;
    if (pending && !position) {
      const direction: TradeDirection = pending.side === "BUY" ? "long" : "short";
      const quote = deriveBidAsk(candle, options.spreadPips, symbol.pipSize);
      const slip = d(options.slippagePips).times(symbol.pipSize);
      const entry = (direction === "long" ? quote.askOpen.plus(slip) : quote.bidOpen.minus(slip)).toFixed(symbol.pricePrecision);
      const distance = d(program.stopPips).times(symbol.pipSize);
      const stopLoss = (direction === "long" ? d(entry).minus(distance) : d(entry).plus(distance)).toFixed(symbol.pricePrecision);
      const takeProfit = (direction === "long" ? d(entry).plus(d(program.targetPips).times(symbol.pipSize)) : d(entry).minus(d(program.targetPips).times(symbol.pipSize))).toFixed(symbol.pricePrecision);
      const sizing = calculatePositionSize({ accountBalance: balance.toFixed(2), accountCurrency: "USD", riskPercent: String(program.riskPercent), entryPrice: entry, stopLoss, pipSize: symbol.pipSize, symbol: symbol.symbol, quoteCurrency: symbol.quoteCurrency, baseCurrency: symbol.baseCurrency });
      crossCurrencyApprox ||= sizing.crossCurrencyApprox;
      if (d(sizing.lots).lte(0) || d(takeProfit).lte(0) || d(stopLoss).lte(0)) skippedSignals++;
      else position = { direction, entryTime: candle.timestamp, entryPrice: entry, stopLoss, takeProfit, lots: sizing.lots, riskAmount: d(sizing.maxExpectedLoss === "Not available" ? 0 : sizing.maxExpectedLoss), commission: commissionForLots(options.commissionPerLot, sizing.lots) };
    }
    pending = null;
    if (position) {
      const hit = checkStopTakeProfit(position.direction, position.stopLoss, position.takeProfit, candle, options.spreadPips, symbol.pipSize, "conservative");
      if (hit) close(candle, hit.price, hit.reason as "stop-loss" | "take-profit", hit.intrabarAmbiguous);
    }
    if (!position && index < candles.length - 1) {
      const matched = program.signals.filter(signal => evaluateSignal(signal, index, series));
      if (matched.length > 1 && new Set(matched.map(signal => signal.side)).size > 1) skippedSignals++;
      else pending = matched[0] ?? null;
    }
  }
  if (position && candles.length) {
    const final = candles.at(-1)!;
    close(final, exitFillPrice(position.direction, final, options.spreadPips, symbol.pipSize).toString(), "end-of-test");
  }
  const wins = trades.filter(trade => d(trade.pnl).gt(0)).length;
  return {
    name: program.name, timeframe: program.timeframe,
    bars: candles.filter(candle => candle.timestamp >= options.startTime).length,
    startingBalance: d(options.startingBalance).toFixed(2), endingBalance: balance.toFixed(2), netPnl: balance.minus(options.startingBalance).toFixed(2),
    winRate: trades.length ? wins / trades.length * 100 : 0,
    profitFactor: grossLoss.gt(0) ? grossProfit.div(grossLoss).toDecimalPlaces(2).toNumber() : null,
    maxDrawdown: maxDrawdown.toFixed(2), trades, equity, skippedSignals, crossCurrencyApprox,
    dataSource: candles[0]?.source ?? "unknown",
    assumptions: { spreadPips: options.spreadPips, slippagePips: options.slippagePips, commissionPerLot: options.commissionPerLot, executionPolicy: "conservative" },
  };
}
