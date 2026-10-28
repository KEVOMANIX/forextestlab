/**
 * Transparent, candle-by-candle exit-rule simulation.
 *
 * Dynamic stops are changed only after the current candle has closed, so a
 * trigger never reaches backwards into the same candle that revealed it. This
 * deliberately conservative ordering avoids an intrabar future-data leak.
 */

import { checkStopTakeProfit, computePnl, deriveBidAsk } from "@/lib/backtest/execution";
import { pipValuePerLot } from "@/lib/backtest/position-sizing";
import type { ClosedTrade, TradeDirection } from "@/lib/backtest/types";
import type { PlanConfig } from "@/lib/backtest/exit-quality";
import type { Candle } from "@/lib/market-data/types";
import { Decimal } from "@/lib/decimal";

const d = (value: Decimal.Value) => new Decimal(value);
const MAX_OPTIMIZER_CANDLES = 10_000;

export type ExitRule =
  | { id: string; label: string; kind: "fixed-target"; targetR: number }
  | { id: string; label: string; kind: "break-even"; triggerR: number }
  | { id: string; label: string; kind: "trailing"; triggerR: number; distanceR: number }
  | { id: string; label: string; kind: "max-hold"; milliseconds: number }
  | { id: string; label: string; kind: "combined"; breakEvenR: number; trailTriggerR: number; distanceR: number; targetR: number };

export const PHASE_ONE_EXIT_RULES: ExitRule[] = [
  ...[0.5, 1, 1.5, 2, 2.5, 3].map((targetR) => ({ id: `target-${targetR}`, label: `Fixed ${targetR}R target`, kind: "fixed-target" as const, targetR })),
  ...[0.5, 1, 1.5, 2].map((triggerR) => ({ id: `be-${triggerR}`, label: `Break even after +${triggerR}R`, kind: "break-even" as const, triggerR })),
  { id: "trail-1-0.5", label: "Trail 0.5R after +1R", kind: "trailing", triggerR: 1, distanceR: 0.5 },
  { id: "trail-1.5-1", label: "Trail 1R after +1.5R", kind: "trailing", triggerR: 1.5, distanceR: 1 },
  { id: "trail-2-1", label: "Trail 1R after +2R", kind: "trailing", triggerR: 2, distanceR: 1 },
  ...[1, 2, 4, 8, 12].map((hours) => ({ id: `hold-${hours}h`, label: `Exit after ${hours} hour${hours === 1 ? "" : "s"}`, kind: "max-hold" as const, milliseconds: hours * 3_600_000 })),
];

export const PHASE_TWO_EXIT_RULES: ExitRule[] = [
  { id: "combo-be1-trail2-1-target3", label: "BE +1R · trail after +2R · target 3R", kind: "combined", breakEvenR: 1, trailTriggerR: 2, distanceR: 1, targetR: 3 },
  { id: "combo-be0.5-trail1.5-1-target3", label: "BE +0.5R · trail after +1.5R · target 3R", kind: "combined", breakEvenR: 0.5, trailTriggerR: 1.5, distanceR: 1, targetR: 3 },
  { id: "combo-be1-trail2-0.5-target3", label: "BE +1R · tight trail after +2R · target 3R", kind: "combined", breakEvenR: 1, trailTriggerR: 2, distanceR: 0.5, targetR: 3 },
  { id: "combo-be1-trail1.5-0.5-target2.5", label: "BE +1R · trail after +1.5R · target 2.5R", kind: "combined", breakEvenR: 1, trailTriggerR: 1.5, distanceR: 0.5, targetR: 2.5 },
];

export const ALL_EXIT_RULES: ExitRule[] = [...PHASE_ONE_EXIT_RULES, ...PHASE_TWO_EXIT_RULES];

export interface OptimizedTradeResult {
  tradeId: string;
  tradeNumber: number;
  entryTime: number;
  actualR: number;
  optimizedR: number;
  deltaR: number;
  money: number;
  reason: string;
}

export interface OptimizerMetrics {
  trades: number;
  netR: number;
  profitFactor: number | null;
  winRate: number;
  averageR: number;
  maxDrawdownR: number;
}

export interface OptimizerRuleResult {
  rule: ExitRule;
  discovery: OptimizerMetrics;
  validation: OptimizerMetrics;
  all: OptimizerMetrics;
  trades: OptimizedTradeResult[];
  validationPassed: boolean;
}

export interface ExitOptimizerReport {
  eligibleTrades: number;
  discoveryTrades: number;
  validationTrades: number;
  evidence: "insufficient" | "experimental" | "developing" | "stronger";
  actual: OptimizerMetrics;
  actualDiscovery: OptimizerMetrics;
  actualValidation: OptimizerMetrics;
  rules: OptimizerRuleResult[];
  bestRuleId: string | null;
}

function riskOf(trade: ClosedTrade) {
  if (!trade.initialRiskAmount || !d(trade.initialRiskAmount).greaterThan(0)) return null;
  return d(trade.initialRiskAmount);
}

export function optimizerTradeEligible(trade: ClosedTrade): boolean {
  return Boolean(riskOf(trade) && trade.initialStopLoss);
}

function priceAtR(trade: ClosedTrade, r: number): string {
  const entry = d(trade.entryPrice);
  const stop = d(trade.initialStopLoss!);
  const distance = entry.minus(stop).abs().times(r);
  return (trade.direction === "long" ? entry.plus(distance) : entry.minus(distance)).toString();
}

function pnlAt(trade: ClosedTrade, config: PlanConfig, price: string): Decimal {
  return d(computePnl({
    direction: trade.direction as TradeDirection,
    entryPrice: trade.entryPrice,
    exitPrice: price,
    lots: trade.lots,
    pipSize: config.pipSize,
    pipValueAccountPerLot: pipValuePerLot({
      pipSize: config.pipSize,
      quoteCurrency: config.quoteCurrency,
      accountCurrency: config.accountCurrency,
      baseCurrency: config.baseCurrency,
      price,
      symbol: config.symbol,
    }).value,
    commission: trade.commission,
  }).pnl);
}

function closePrice(trade: ClosedTrade, candle: Candle, config: PlanConfig): string {
  const quote = deriveBidAsk(candle, config.spreadPips, config.pipSize);
  return (trade.direction === "long" ? quote.bidClose : quote.askClose).toString();
}

export function simulateExitRule(
  trade: ClosedTrade,
  tradeNumber: number,
  candles: Candle[],
  config: PlanConfig,
  rule: ExitRule,
): OptimizedTradeResult | null {
  const risk = riskOf(trade);
  if (!risk || !trade.initialStopLoss) return null;
  const forward = candles.filter((candle) => candle.timestamp >= trade.entryTime).slice(0, MAX_OPTIMIZER_CANDLES);
  if (!forward.length) return null;

  let stopR = -1;
  let stopLoss = trade.initialStopLoss;
  const takeProfit = rule.kind === "fixed-target" || rule.kind === "combined" ? priceAtR(trade, rule.targetR) : trade.initialTakeProfit ?? null;
  let peakR = 0;
  let exitPrice: string | null = null;
  let reason = "session-end";

  for (const candle of forward) {
    const hit = checkStopTakeProfit(trade.direction as TradeDirection, stopLoss, takeProfit, candle, config.spreadPips, config.pipSize, config.executionPolicy);
    if (hit) {
      exitPrice = hit.price;
      reason = hit.reason;
      break;
    }

    if (rule.kind === "max-hold" && candle.timestamp - trade.entryTime >= rule.milliseconds) {
      exitPrice = closePrice(trade, candle, config);
      reason = "maximum holding time";
      break;
    }

    // Decisions made from this candle become active on the next candle.
    const quote = deriveBidAsk(candle, config.spreadPips, config.pipSize);
    const favourable = (trade.direction === "long" ? quote.bidHigh : quote.askLow).toString();
    peakR = Math.max(peakR, pnlAt(trade, config, favourable).dividedBy(risk).toNumber());
    if (rule.kind === "break-even" && peakR >= rule.triggerR && stopR < 0) {
      stopR = 0;
      stopLoss = priceAtR(trade, 0);
    }
    if (rule.kind === "trailing" && peakR >= rule.triggerR) {
      const nextStopR = Math.max(0, peakR - rule.distanceR);
      if (nextStopR > stopR) {
        stopR = nextStopR;
        stopLoss = priceAtR(trade, nextStopR);
      }
    }
    if (rule.kind === "combined") {
      if (peakR >= rule.breakEvenR && stopR < 0) {
        stopR = 0;
        stopLoss = priceAtR(trade, 0);
      }
      if (peakR >= rule.trailTriggerR) {
        const nextStopR = Math.max(0, peakR - rule.distanceR);
        if (nextStopR > stopR) {
          stopR = nextStopR;
          stopLoss = priceAtR(trade, nextStopR);
        }
      }
    }
  }

  exitPrice ??= closePrice(trade, forward[forward.length - 1]!, config);
  const optimizedMoney = pnlAt(trade, config, exitPrice);
  const optimizedR = optimizedMoney.dividedBy(risk).toNumber();
  const actualR = d(trade.pnl).dividedBy(risk).toNumber();
  return {
    tradeId: trade.id,
    tradeNumber,
    entryTime: trade.entryTime,
    actualR,
    optimizedR,
    deltaR: optimizedR - actualR,
    money: optimizedMoney.toNumber(),
    reason,
  };
}

export function optimizerMetrics(values: number[]): OptimizerMetrics {
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
    if (value > 0) grossProfit += value;
    if (value < 0) grossLoss += Math.abs(value);
  }
  return {
    trades: values.length,
    netR: values.reduce((sum, value) => sum + value, 0),
    profitFactor: grossLoss ? grossProfit / grossLoss : null,
    winRate: values.length ? values.filter((value) => value > 0).length / values.length * 100 : 0,
    averageR: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    maxDrawdownR,
  };
}

export function buildOptimizerReport(results: Array<{ rule: ExitRule; trades: OptimizedTradeResult[] }>): ExitOptimizerReport | null {
  const ordered = results[0]?.trades.slice().sort((a, b) => a.entryTime - b.entryTime) ?? [];
  if (!ordered.length) return null;
  const split = Math.max(1, Math.min(ordered.length - 1, Math.floor(ordered.length * 0.7)));
  const discoveryIds = new Set(ordered.slice(0, split).map((row) => row.tradeId));
  const actual = optimizerMetrics(ordered.map((row) => row.actualR));
  const actualDiscovery = optimizerMetrics(ordered.slice(0, split).map((row) => row.actualR));
  const actualValidation = optimizerMetrics(ordered.slice(split).map((row) => row.actualR));
  const rules = results.map(({ rule, trades }) => {
    const sorted = trades.slice().sort((a, b) => a.entryTime - b.entryTime);
    const discovery = optimizerMetrics(sorted.filter((row) => discoveryIds.has(row.tradeId)).map((row) => row.optimizedR));
    const validation = optimizerMetrics(sorted.filter((row) => !discoveryIds.has(row.tradeId)).map((row) => row.optimizedR));
    const all = optimizerMetrics(sorted.map((row) => row.optimizedR));
    return { rule, discovery, validation, all, trades: sorted, validationPassed: validation.trades >= 3 && validation.netR > actualValidation.netR && validation.netR > 0 && (validation.profitFactor === null || validation.profitFactor > 1) };
  }).sort((a, b) => Number(b.validationPassed) - Number(a.validationPassed) || b.validation.netR - a.validation.netR || a.validation.maxDrawdownR - b.validation.maxDrawdownR);
  const count = ordered.length;
  return {
    eligibleTrades: count,
    discoveryTrades: split,
    validationTrades: count - split,
    evidence: count < 20 ? "insufficient" : count < 50 ? "experimental" : count < 100 ? "developing" : "stronger",
    actual,
    actualDiscovery,
    actualValidation,
    rules,
    bestRuleId: rules.find((row) => row.validationPassed)?.rule.id ?? null,
  };
}
