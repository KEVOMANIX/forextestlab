import { propFirmProgress } from "./prop-firm";
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

/**
 * Challenge rules applied at the order form.
 *
 * The engine is what actually fails a run, on the candle — this only stops the
 * orders that cannot end well: trading a breached account, or sending a trade
 * whose own stop-loss is wider than the headroom left before a limit. Risk is
 * only knowable with a stop attached; without one the trade is allowed through
 * and the engine grades it like any other.
 */
export function propFirmGuardMessage(
  state: PublicSessionState,
  order: OrderRequest,
): string | null {
  const rules = state.config.propFirm;
  const runtime = state.propFirm;
  if (!rules || !runtime) return null;

  if (runtime.status === "breached") {
    return "This challenge has been breached. No further orders can be placed.";
  }

  const progress = propFirmProgress({
    rules,
    startingBalance: state.config.startingBalance,
    equity: state.equity,
    peakEquity: state.maxEquity,
    runtime,
  });

  const stopLoss = order.stopLoss;
  if (!stopLoss) return null;
  const plan = defaultTradePlan(state, order.direction);
  if (!plan) return null;
  const metrics = tradePlanMetrics({
    state,
    plan: {
      ...plan,
      entryPrice: order.entryPrice ?? plan.entryPrice,
      stopLoss,
      takeProfit: order.takeProfit ?? "",
    },
    sizingMode: order.sizingMode,
    lots: order.lots,
    riskPercent: order.riskPercent,
  });
  if (!metrics.valid) return null;
  const risk = Number(metrics.riskAmount);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const daily = Number(progress.dailyRemaining);
  if (risk > daily) {
    return `Risking ${risk.toFixed(2)} leaves the daily loss limit behind — only ${daily.toFixed(2)} of today's allowance is left.`;
  }
  const total = Number(progress.totalRemaining);
  if (risk > total) {
    return `Risking ${risk.toFixed(2)} would breach the maximum loss limit — only ${total.toFixed(2)} is left.`;
  }
  return null;
}
