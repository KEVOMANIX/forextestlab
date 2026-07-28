import { defaultTradePlan, tradePlanMetrics } from "./trade-plan";
import type { OrderRequest, PublicSessionState } from "./types";

export interface TradingLimits {
  maxRiskPerTradePercent: number;
  dailyLossLimitPercent: number;
  maxDrawdownLimitPercent: number;
  sessionTradeLimit: number;
  sessionGoalAmount: number;
}

function dayKey(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

export function tradingGuardMessage(
  state: PublicSessionState,
  order: OrderRequest,
  limits: TradingLimits,
): string | null {
  const startingBalance = Number(state.config.startingBalance);
  const currentBalance = Number(state.balance);

  if (
    limits.maxDrawdownLimitPercent > 0 &&
    Number(state.maxDrawdownPercent) >= limits.maxDrawdownLimitPercent
  ) {
    return `Maximum drawdown limit reached (${state.maxDrawdownPercent}% / ${limits.maxDrawdownLimitPercent}%).`;
  }

  if (
    limits.sessionGoalAmount > 0 &&
    currentBalance - startingBalance >= limits.sessionGoalAmount
  ) {
    return `Session goal reached (+${limits.sessionGoalAmount.toFixed(2)}). New entries are paused.`;
  }

  const logicalTrades = new Set([
    ...state.closedTrades.map((trade) => trade.journalId ?? trade.id),
    ...state.openPositions.map((position) => position.journalId ?? position.id),
    ...state.pendingOrders
      .filter((pending) => pending.status === "pending")
      .map((pending) => pending.id),
  ]).size;
  if (limits.sessionTradeLimit > 0 && logicalTrades >= limits.sessionTradeLimit) {
    return `Session trade limit reached (${logicalTrades} / ${limits.sessionTradeLimit}).`;
  }

  if (limits.dailyLossLimitPercent > 0 && state.currentTime != null) {
    const currentDay = dayKey(state.currentTime);
    const dailyPnl = state.closedTrades
      .filter((trade) => dayKey(trade.exitTime) === currentDay)
      .reduce((sum, trade) => sum + Number(trade.pnl), 0);
    const dailyLossPercent =
      startingBalance > 0 ? Math.max(0, -dailyPnl / startingBalance * 100) : 0;
    if (dailyLossPercent >= limits.dailyLossLimitPercent) {
      return `Daily loss limit reached (${dailyLossPercent.toFixed(2)}% / ${limits.dailyLossLimitPercent}%).`;
    }
  }

  if (limits.maxRiskPerTradePercent > 0) {
    let riskPercent: number | null = null;
    if (order.sizingMode === "risk-percent") {
      riskPercent = Number(order.riskPercent);
    } else {
      const plan = defaultTradePlan(state, order.direction);
      if (!plan || !order.stopLoss) {
        return `Add a stop loss to enforce the ${limits.maxRiskPerTradePercent}% risk limit.`;
      }
      const metrics = tradePlanMetrics({
        state,
        plan: {
          ...plan,
          entryPrice: order.entryPrice ?? plan.entryPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit ?? "",
        },
        sizingMode: "fixed-lots",
        lots: order.lots,
      });
      if (metrics.valid && Number.isFinite(Number(metrics.riskAmount)) && currentBalance > 0) {
        riskPercent = Number(metrics.riskAmount) / currentBalance * 100;
      }
    }
    if (riskPercent != null && riskPercent > limits.maxRiskPerTradePercent) {
      return `Trade risk is ${riskPercent.toFixed(2)}%, above your ${limits.maxRiskPerTradePercent}% limit.`;
    }
  }

  return null;
}
