import { d, isFiniteNumeric } from "@/lib/decimal";

import { commissionForLots, computePnl } from "./execution";
import { calculatePositionSize, pipValuePerLot } from "./position-sizing";
import type {
  PositionSizingMode,
  PublicSessionState,
  TradeDirection,
} from "./types";

export interface TradePlan {
  direction: TradeDirection;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
}

export interface TradePlanMetrics {
  valid: boolean;
  error: string | null;
  lots: string;
  stopPips: string;
  targetPips: string;
  riskReward: string;
  riskAmount: string;
  projectedProfit: string;
  spreadCost: string;
}

interface TradePlanMetricInput {
  state: PublicSessionState;
  plan: TradePlan;
  sizingMode: PositionSizingMode;
  lots?: string;
  riskPercent?: string;
}

export function estimatedMarketEntry(
  state: PublicSessionState,
  direction: TradeDirection,
): string | null {
  if (!state.currentPrice || !isFiniteNumeric(state.currentPrice)) return null;
  const pip = d(state.config.pipSize);
  const halfSpread = d(state.config.spreadPips).times(pip).div(2);
  const slippage = d(state.config.slippagePips).times(pip);
  const entry =
    direction === "long"
      ? d(state.currentPrice).plus(halfSpread).plus(slippage)
      : d(state.currentPrice).minus(halfSpread).minus(slippage);
  return entry.toFixed(state.config.pricePrecision);
}

export function defaultTradePlan(
  state: PublicSessionState,
  direction: TradeDirection,
): TradePlan | null {
  const entryPrice = estimatedMarketEntry(state, direction);
  if (!entryPrice) return null;
  const entry = d(entryPrice);
  const stopDistance = d(state.config.pipSize).times(20);
  const targetDistance = d(state.config.pipSize).times(40);
  return {
    direction,
    entryPrice,
    stopLoss:
      direction === "long"
        ? entry.minus(stopDistance).toFixed(state.config.pricePrecision)
        : entry.plus(stopDistance).toFixed(state.config.pricePrecision),
    takeProfit:
      direction === "long"
        ? entry.plus(targetDistance).toFixed(state.config.pricePrecision)
        : entry.minus(targetDistance).toFixed(state.config.pricePrecision),
  };
}

export function tradePlanMetrics({
  state,
  plan,
  sizingMode,
  lots,
  riskPercent,
}: TradePlanMetricInput): TradePlanMetrics {
  const unavailable: TradePlanMetrics = {
    valid: false,
    error: "Enter valid entry, stop-loss and take-profit prices.",
    lots: "—",
    stopPips: "—",
    targetPips: "—",
    riskReward: "—",
    riskAmount: "—",
    projectedProfit: "—",
    spreadCost: "—",
  };
  if (
    !isFiniteNumeric(plan.entryPrice) ||
    !isFiniteNumeric(plan.stopLoss) ||
    !isFiniteNumeric(plan.takeProfit) ||
    !isFiniteNumeric(state.config.pipSize) ||
    d(state.config.pipSize).lte(0)
  ) {
    return unavailable;
  }
  if (
    sizingMode === "fixed-lots" &&
    (!lots || !isFiniteNumeric(lots) || d(lots).lte(0))
  ) {
    return { ...unavailable, error: "Enter a position size greater than zero." };
  }
  if (
    sizingMode === "risk-percent" &&
    (!riskPercent ||
      !isFiniteNumeric(riskPercent) ||
      d(riskPercent).lte(0))
  ) {
    return { ...unavailable, error: "Enter an account risk greater than zero." };
  }

  const entry = d(plan.entryPrice);
  const stop = d(plan.stopLoss);
  const target = d(plan.takeProfit);
  const correctOrder =
    plan.direction === "long"
      ? stop.lt(entry) && target.gt(entry)
      : stop.gt(entry) && target.lt(entry);
  if (!correctOrder) {
    return {
      ...unavailable,
      error:
        plan.direction === "long"
          ? "For a Buy plan, SL must be below entry and TP above it."
          : "For a Sell plan, SL must be above entry and TP below it.",
    };
  }

  const sizing = calculatePositionSize({
    accountBalance: state.balance,
    accountCurrency: state.config.accountCurrency,
    riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
    entryPrice: plan.entryPrice,
    stopLoss: plan.stopLoss,
    pipSize: state.config.pipSize,
    symbol: state.config.symbol,
    quoteCurrency: state.config.quoteCurrency,
    baseCurrency: state.config.baseCurrency,
    fixedLots: sizingMode === "fixed-lots" ? lots : undefined,
  });
  if (!isFiniteNumeric(sizing.lots) || d(sizing.lots).lte(0)) {
    return { ...unavailable, error: "Enter a position size greater than zero." };
  }

  const pipValue = pipValuePerLot({
    pipSize: state.config.pipSize,
    quoteCurrency: state.config.quoteCurrency,
    accountCurrency: state.config.accountCurrency,
    baseCurrency: state.config.baseCurrency,
    price: plan.takeProfit,
    symbol: state.config.symbol,
  });
  if (!isFiniteNumeric(pipValue.value)) {
    return { ...unavailable, error: "The pip value could not be calculated." };
  }

  const stopPips = entry.minus(stop).abs().div(state.config.pipSize);
  const targetPips = target.minus(entry).abs().div(state.config.pipSize);
  const commission = commissionForLots(
    state.config.commissionPerLot,
    sizing.lots,
  );
  const projected = computePnl({
    direction: plan.direction,
    entryPrice: plan.entryPrice,
    exitPrice: plan.takeProfit,
    lots: sizing.lots,
    pipSize: state.config.pipSize,
    pipValueAccountPerLot: pipValue.value,
    commission,
  });
  const stopped = computePnl({
    direction: plan.direction,
    entryPrice: plan.entryPrice,
    exitPrice: plan.stopLoss,
    lots: sizing.lots,
    pipSize: state.config.pipSize,
    pipValueAccountPerLot: pipValue.value,
    commission,
  });
  const spreadCost = d(state.config.spreadPips)
    .times(pipValue.value)
    .times(sizing.lots)
    .toFixed(2);

  return {
    valid: true,
    error: null,
    lots: sizing.lots,
    stopPips: stopPips.toFixed(1),
    targetPips: targetPips.toFixed(1),
    riskReward: targetPips.div(stopPips).toFixed(2),
    riskAmount: d(stopped.pnl).abs().toFixed(2),
    projectedProfit: projected.pnl,
    spreadCost,
  };
}
