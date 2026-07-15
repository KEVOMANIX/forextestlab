/**
 * Performance statistics for a completed backtest.
 *
 * All arithmetic goes through decimal.js — no native float math. Values are
 * decimal strings. Whenever a metric is undefined (division by zero, no
 * qualifying trades, empty equity curve) the string "Not available" is
 * returned rather than emitting NaN or Infinity.
 */

import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import { Decimal, d, money } from "@/lib/decimal";

const NOT_AVAILABLE = "Not available";

export interface PerformanceStats {
  startingBalance: string;
  endingBalance: string;
  netProfit: string;
  grossProfit: string;
  grossLoss: string; // reported as a positive magnitude
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: string; // percent 1dp, or "Not available" when 0 trades
  averageWin: string; // "Not available" when no wins
  averageLoss: string; // positive magnitude, "Not available" when no losses
  largestWin: string; // "Not available" when no wins
  largestLoss: string; // positive magnitude, "Not available" when no losses
  profitFactor: string; // 2dp, "Not available" when grossLoss == 0
  expectancy: string; // per-trade expected P&L, "Not available" when 0 trades
  maxDrawdown: string; // account currency, positive magnitude
  maxDrawdownPercent: string; // percent 1dp
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageRiskReward: string; // avg (achieved reward / achieved risk); "Not available" when not computable
}

export function computeStatistics(params: {
  startingBalance: string;
  endingBalance: string;
  trades: ClosedTrade[];
  equityCurve: EquityPoint[];
}): PerformanceStats {
  const { startingBalance, endingBalance, trades, equityCurve } = params;

  const totalTrades = trades.length;

  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfit = d(0);
  let grossLoss = d(0); // accumulated as a positive magnitude
  let largestWin: Decimal | null = null;
  let largestLoss: Decimal | null = null; // stored as a positive magnitude

  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;

  // Average achieved risk/reward.
  let riskRewardSum = d(0);
  let riskRewardCount = 0;

  for (const trade of trades) {
    const pnl = d(trade.pnl);

    if (pnl.greaterThan(0)) {
      winningTrades += 1;
      grossProfit = grossProfit.plus(pnl);
      if (largestWin === null || pnl.greaterThan(largestWin)) {
        largestWin = pnl;
      }
      currentWinStreak += 1;
      currentLossStreak = 0;
      if (currentWinStreak > maxConsecutiveWins) {
        maxConsecutiveWins = currentWinStreak;
      }
    } else if (pnl.lessThan(0)) {
      losingTrades += 1;
      const magnitude = pnl.abs();
      grossLoss = grossLoss.plus(magnitude);
      if (largestLoss === null || magnitude.greaterThan(largestLoss)) {
        largestLoss = magnitude;
      }
      currentLossStreak += 1;
      currentWinStreak = 0;
      if (currentLossStreak > maxConsecutiveLosses) {
        maxConsecutiveLosses = currentLossStreak;
      }
    } else {
      // pnl == 0: breaks both streaks, counts as neither win nor loss.
      currentWinStreak = 0;
      currentLossStreak = 0;
    }

    // Achieved risk/reward, only when a stop-loss is defined and risk > 0.
    if (trade.stopLoss !== null) {
      const entry = d(trade.entryPrice);
      const stop = d(trade.stopLoss);
      const exit = d(trade.exitPrice);
      const risk = entry.minus(stop).abs();
      if (risk.greaterThan(0)) {
        const reward = exit.minus(entry).abs();
        riskRewardSum = riskRewardSum.plus(reward.dividedBy(risk));
        riskRewardCount += 1;
      }
    }
  }

  const netProfit = d(endingBalance).minus(startingBalance);
  const netProfitFromTrades = grossProfit.minus(grossLoss);

  const winRate =
    totalTrades === 0
      ? NOT_AVAILABLE
      : d(winningTrades).dividedBy(totalTrades).times(100).toFixed(1);

  const averageWin =
    winningTrades === 0
      ? NOT_AVAILABLE
      : money(grossProfit.dividedBy(winningTrades));

  const averageLoss =
    losingTrades === 0
      ? NOT_AVAILABLE
      : money(grossLoss.dividedBy(losingTrades));

  const profitFactor = grossLoss.isZero()
    ? NOT_AVAILABLE
    : grossProfit.dividedBy(grossLoss).toFixed(2);

  const expectancy =
    totalTrades === 0
      ? NOT_AVAILABLE
      : money(netProfitFromTrades.dividedBy(totalTrades));

  const drawdown = computeDrawdown(equityCurve);

  const averageRiskReward =
    riskRewardCount === 0
      ? NOT_AVAILABLE
      : riskRewardSum.dividedBy(riskRewardCount).toFixed(2);

  return {
    startingBalance: money(startingBalance),
    endingBalance: money(endingBalance),
    netProfit: money(netProfit),
    grossProfit: money(grossProfit),
    grossLoss: money(grossLoss),
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    averageWin,
    averageLoss,
    largestWin: largestWin === null ? NOT_AVAILABLE : money(largestWin),
    largestLoss: largestLoss === null ? NOT_AVAILABLE : money(largestLoss),
    profitFactor,
    expectancy,
    maxDrawdown: drawdown.maxDrawdown,
    maxDrawdownPercent: drawdown.maxDrawdownPercent,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    averageRiskReward,
  };
}

function computeDrawdown(equityCurve: EquityPoint[]): {
  maxDrawdown: string;
  maxDrawdownPercent: string;
} {
  if (equityCurve.length === 0) {
    return { maxDrawdown: money(0), maxDrawdownPercent: d(0).toFixed(1) };
  }

  let peak: Decimal | null = null;
  let maxDrawdown = d(0);
  let peakAtMaxDrawdown = d(0);

  for (const point of equityCurve) {
    const equity = d(point.equity);
    if (peak === null || equity.greaterThan(peak)) {
      peak = equity;
    }
    const drawdown = peak.minus(equity);
    if (drawdown.greaterThan(maxDrawdown)) {
      maxDrawdown = drawdown;
      peakAtMaxDrawdown = peak;
    }
  }

  const maxDrawdownPercent = peakAtMaxDrawdown.isZero()
    ? d(0).toFixed(1)
    : maxDrawdown.dividedBy(peakAtMaxDrawdown).times(100).toFixed(1);

  return { maxDrawdown: money(maxDrawdown), maxDrawdownPercent };
}
