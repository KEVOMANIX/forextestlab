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

type IndicatorTracker = { previous: number; current: number; push(close: number): void };
const keyOf = (indicator: Indicator): string => indicator.kind === "CLOSE" ? "CLOSE" : `${indicator.kind}:${indicator.period}`;

/** Indicators retain at most their lookback, so a 20-year test needs no 20-year candle array. */
function createTracker(indicator: Indicator): IndicatorTracker {
  let previous = NaN;
  let current = NaN;
  if (indicator.kind === "CLOSE") return {
    get previous() { return previous; }, get current() { return current; },
    push(close) { previous = current; current = close; },
  };
  const period = indicator.period;
  let count = 0;
  let sum = 0;
  const window: number[] = [];
  let priorClose = NaN;
  let averageGain = 0;
  let averageLoss = 0;
  return {
    get previous() { return previous; }, get current() { return current; },
    push(close) {
      previous = current;
      count++;
      if (indicator.kind === "SMA") {
        window.push(close);
        sum += close;
        if (window.length > period) sum -= window.shift()!;
        current = window.length === period ? sum / period : NaN;
        return;
      }
      if (indicator.kind === "EMA") {
        if (count <= period) {
          sum += close;
          current = count === period ? sum / period : NaN;
        } else current = close * (2 / (period + 1)) + current * (1 - 2 / (period + 1));
        return;
      }
      if (Number.isFinite(priorClose)) {
        const change = close - priorClose;
        const gain = Math.max(0, change);
        const loss = Math.max(0, -change);
        if (count <= period + 1) { averageGain += gain; averageLoss += loss; }
        else { averageGain = (averageGain * (period - 1) + gain) / period; averageLoss = (averageLoss * (period - 1) + loss) / period; }
      }
      priorClose = close;
      if (count < period + 1) { current = NaN; return; }
      if (count === period + 1) { averageGain /= period; averageLoss /= period; }
      current = averageGain === 0 && averageLoss === 0 ? 50 : averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
    },
  };
}

function signalMatches(signal: StrategySignal, trackers: Map<string, IndicatorTracker>): boolean {
  const read = (operand: Operand, previous: boolean): number => operand.kind === "NUMBER" ? operand.value : (previous ? trackers.get(keyOf(operand))?.previous : trackers.get(keyOf(operand))?.current) ?? NaN;
  const left = read(signal.left, false);
  const right = read(signal.right, false);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (signal.comparison === "ABOVE") return left > right;
  if (signal.comparison === "BELOW") return left < right;
  const beforeLeft = read(signal.left, true);
  const beforeRight = read(signal.right, true);
  if (!Number.isFinite(beforeLeft) || !Number.isFinite(beforeRight)) return false;
  return signal.comparison === "CROSSES ABOVE" ? beforeLeft <= beforeRight && left > right : beforeLeft >= beforeRight && left < right;
}

type Position = { direction: TradeDirection; entryTime: number; entryPrice: string; stopLoss: string; takeProfit: string; lots: string; riskAmount: Decimal; commission: string };

/** The caller feeds candles in time order, optionally across many provider chunks. */
export function createStrategyRunner(program: StrategyProgram, options: StrategyRunOptions) {
  const { symbol } = options;
  const trackers = new Map<string, IndicatorTracker>();
  for (const signal of program.signals) for (const operand of [signal.left, signal.right]) {
    if (operand.kind === "NUMBER") continue;
    const key = keyOf(operand);
    if (!trackers.has(key)) trackers.set(key, createTracker(operand));
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
  let position: Position | null = null;
  let lastCandle: Candle | null = null;
  let bars = 0;
  let dataSource = "unknown";
  let finished: StrategyReport | null = null;

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

  const push = (candle: Candle) => {
    if (finished) throw new Error("Cannot add candles after the test has finished.");
    if (lastCandle && candle.timestamp <= lastCandle.timestamp) throw new Error("Market candles must be in time order.");
    const closeValue = Number(candle.close);
    if (![closeValue, Number(candle.open), Number(candle.high), Number(candle.low)].every(Number.isFinite)) throw new Error("Market candles must have valid prices.");
    lastCandle = candle;
    if (dataSource === "unknown") dataSource = candle.source;
    if (candle.timestamp >= options.startTime) {
      bars++;
      if (pending && !position) {
        const direction: TradeDirection = pending.side === "BUY" ? "long" : "short";
        const quote = deriveBidAsk(candle, options.spreadPips, symbol.pipSize);
        const slip = d(options.slippagePips).times(symbol.pipSize);
        const entry = (direction === "long" ? quote.askOpen.plus(slip) : quote.bidOpen.minus(slip)).toFixed(symbol.pricePrecision);
        const stopLoss = (direction === "long" ? d(entry).minus(d(program.stopPips).times(symbol.pipSize)) : d(entry).plus(d(program.stopPips).times(symbol.pipSize))).toFixed(symbol.pricePrecision);
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
    }
    // The current close becomes visible only after entries and stops on this bar.
    for (const tracker of trackers.values()) tracker.push(closeValue);
    if (candle.timestamp >= options.startTime && !position) {
      const matched = program.signals.filter(signal => signalMatches(signal, trackers));
      if (matched.length > 1 && new Set(matched.map(signal => signal.side)).size > 1) skippedSignals++;
      else pending = matched[0] ?? null;
    }
  };

  const finish = (): StrategyReport => {
    if (finished) return finished;
    if (position && lastCandle) close(lastCandle, exitFillPrice(position.direction, lastCandle, options.spreadPips, symbol.pipSize).toString(), "end-of-test");
    const wins = trades.filter(trade => d(trade.pnl).gt(0)).length;
    const stride = Math.max(1, Math.ceil(equity.length / 1_500));
    const chartEquity = equity.filter((_, index) => index % stride === 0 || index === equity.length - 1);
    finished = {
      name: program.name, timeframe: program.timeframe, bars,
      startingBalance: d(options.startingBalance).toFixed(2), endingBalance: balance.toFixed(2), netPnl: balance.minus(options.startingBalance).toFixed(2),
      winRate: trades.length ? wins / trades.length * 100 : 0,
      profitFactor: grossLoss.gt(0) ? grossProfit.div(grossLoss).toDecimalPlaces(2).toNumber() : null,
      maxDrawdown: maxDrawdown.toFixed(2), trades, equity: chartEquity, skippedSignals, crossCurrencyApprox, dataSource,
      assumptions: { spreadPips: options.spreadPips, slippagePips: options.slippagePips, commissionPerLot: options.commissionPerLot, executionPolicy: "conservative" },
    };
    return finished;
  };
  return { push, finish, get bars() { return bars; } };
}

/** Convenient batch adapter for tests and small in-memory callers. */
export function runStrategy(program: StrategyProgram, candles: Candle[], options: StrategyRunOptions): StrategyReport {
  const runner = createStrategyRunner(program, options);
  for (const candle of candles) runner.push(candle);
  return runner.finish();
}
