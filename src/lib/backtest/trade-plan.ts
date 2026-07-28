import { d, isFiniteNumeric } from "@/lib/decimal";

import { commissionForLots, computePnl } from "./execution";
import {
  calculatePositionSize,
  marginRequired,
  pipValuePerLot,
} from "./position-sizing";
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
  margin: string;
  availableMargin: string;
  leverage: string;
  pipValue: string;
  tradeValue: string;
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
  return {
    direction,
    entryPrice,
    stopLoss: "",
    takeProfit: "",
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
    error: "Enter a valid entry price.",
    lots: "—",
    stopPips: "—",
    targetPips: "—",
    riskReward: "—",
    riskAmount: "—",
    projectedProfit: "—",
    spreadCost: "—",
    margin: "—",
    availableMargin: "—",
    leverage: state.config.leverage ?? "100",
    pipValue: "—",
    tradeValue: "—",
  };
  const hasStop = plan.stopLoss.trim() !== "";
  const hasTarget = plan.takeProfit.trim() !== "";
  if (
    !isFiniteNumeric(plan.entryPrice) ||
    (hasStop && !isFiniteNumeric(plan.stopLoss)) ||
    (hasTarget && !isFiniteNumeric(plan.takeProfit)) ||
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
  if (sizingMode === "risk-percent" && !hasStop) {
    return {
      ...unavailable,
      error: "Add a stop loss to calculate risk-based position size.",
    };
  }

  const entry = d(plan.entryPrice);
  const stop = hasStop ? d(plan.stopLoss) : null;
  const target = hasTarget ? d(plan.takeProfit) : null;
  const stopCorrect =
    !stop ||
    (plan.direction === "long" ? stop.lt(entry) : stop.gt(entry));
  const targetCorrect =
    !target ||
    (plan.direction === "long" ? target.gt(entry) : target.lt(entry));
  if (!stopCorrect || !targetCorrect) {
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
    stopLoss: hasStop ? plan.stopLoss : undefined,
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
    price: hasTarget ? plan.takeProfit : plan.entryPrice,
    symbol: state.config.symbol,
  });
  if (!isFiniteNumeric(pipValue.value)) {
    return { ...unavailable, error: "The pip value could not be calculated." };
  }

  const stopPips = stop
    ? entry.minus(stop).abs().div(state.config.pipSize)
    : null;
  const targetPips = target
    ? target.minus(entry).abs().div(state.config.pipSize)
    : null;
  const commission = commissionForLots(
    state.config.commissionPerLot,
    sizing.lots,
  );
  const projected = hasTarget
    ? computePnl({
        direction: plan.direction,
        entryPrice: plan.entryPrice,
        exitPrice: plan.takeProfit,
        lots: sizing.lots,
        pipSize: state.config.pipSize,
        pipValueAccountPerLot: pipValue.value,
        commission,
      })
    : null;
  const stopped = hasStop
    ? computePnl({
        direction: plan.direction,
        entryPrice: plan.entryPrice,
        exitPrice: plan.stopLoss,
        lots: sizing.lots,
        pipSize: state.config.pipSize,
        pipValueAccountPerLot: pipValue.value,
        commission,
      })
    : null;
  const spreadCost = d(state.config.spreadPips)
    .times(pipValue.value)
    .times(sizing.lots)
    .toFixed(2);
  const margin = marginRequired({
    lots: sizing.lots,
    price: plan.entryPrice,
    leverage: state.config.leverage,
    accountCurrency: state.config.accountCurrency,
    baseCurrency: state.config.baseCurrency,
    quoteCurrency: state.config.quoteCurrency,
  });
  const remainingMargin = isFiniteNumeric(margin.value)
    ? d(state.equity).minus(margin.value)
    : null;
  const availableMargin = remainingMargin
    ? (remainingMargin.gt(0) ? remainingMargin : d(0)).toFixed(2)
    : "—";
  const notionalBase = d(sizing.lots).times(100000);
  const tradeValue =
    state.config.baseCurrency === state.config.accountCurrency
      ? notionalBase
      : notionalBase.times(plan.entryPrice);

  return {
    valid: true,
    error: null,
    lots: sizing.lots,
    stopPips: stopPips?.toFixed(1) ?? "—",
    targetPips: targetPips?.toFixed(1) ?? "—",
    riskReward:
      stopPips && targetPips && stopPips.gt(0)
        ? targetPips.div(stopPips).toFixed(2)
        : "—",
    riskAmount: stopped ? d(stopped.pnl).abs().toFixed(2) : "—",
    projectedProfit: projected?.pnl ?? "—",
    spreadCost,
    margin: margin.value,
    availableMargin,
    leverage: state.config.leverage ?? "100",
    pipValue: d(pipValue.value).times(sizing.lots).toFixed(2),
    tradeValue: tradeValue.toFixed(2),
  };
}
