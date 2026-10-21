/**
 * Headline performance over a trader's recent practice trades.
 *
 * Win rate alone misleads: a 43% win rate is profitable when winners are 2.5×
 * the size of losers. These figures put the size of wins and losses beside it,
 * and the cumulative curve shows how the result was reached.
 */

import { Decimal } from "@/lib/decimal";

export interface PracticePerformance {
  tradeCount: number;
  wins: number;
  losses: number;
  netPnl: string;
  /** Average P/L per trade. */
  expectancy: string;
  grossProfit: string;
  grossLoss: string;
  /** Gross profit over gross loss; null without a losing trade. */
  profitFactor: number | null;
  winRate: number;
  averageWin: string | null;
  averageLoss: string | null;
  /** Average win over average loss; null unless both exist. */
  winLossRatio: number | null;
  /** Win rate at which this win/loss ratio exactly breaks even. */
  breakEvenWinRate: number | null;
  bestTrade: string;
  worstTrade: string;
  /** Largest fall from a running peak of cumulative P/L, as a positive amount. */
  maxDrawdown: string;
  /** Cumulative P/L before the first trade (0) and after each one, oldest first. */
  curve: number[];
  /** Curve indexes of the peak and trough that make up the largest drawdown. */
  drawdown: { peakIndex: number; troughIndex: number } | null;
}

/** `pnls` oldest first. Returns null when there are no trades to describe. */
export function practicePerformance(pnls: Array<string | number>): PracticePerformance | null {
  if (!pnls.length) return null;
  const values = pnls.map((pnl) => new Decimal(pnl));
  const winners = values.filter((value) => value.greaterThan(0));
  const losers = values.filter((value) => value.lessThan(0));
  const sum = (list: Decimal[]) => list.reduce((total, value) => total.plus(value), new Decimal(0));
  const grossProfit = sum(winners);
  const grossLoss = sum(losers).abs();
  const net = grossProfit.minus(grossLoss);

  let running = new Decimal(0);
  let peak = running;
  let peakIndex = 0;
  let maxDrawdown = new Decimal(0);
  let drawdown: PracticePerformance["drawdown"] = null;
  const curve = [0];
  values.forEach((value, index) => {
    running = running.plus(value);
    curve.push(running.toNumber());
    if (running.greaterThan(peak)) {
      peak = running;
      peakIndex = index + 1;
    } else if (peak.minus(running).greaterThan(maxDrawdown)) {
      maxDrawdown = peak.minus(running);
      drawdown = { peakIndex, troughIndex: index + 1 };
    }
  });

  const averageWin = winners.length ? grossProfit.dividedBy(winners.length) : null;
  const averageLoss = losers.length ? grossLoss.dividedBy(losers.length) : null;
  const winLossRatio = averageWin && averageLoss && !averageLoss.isZero() ? averageWin.dividedBy(averageLoss).toNumber() : null;
  const sorted = [...values].sort((left, right) => left.comparedTo(right));

  return {
    tradeCount: values.length,
    wins: winners.length,
    losses: losers.length,
    netPnl: net.toFixed(2),
    expectancy: net.dividedBy(values.length).toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    grossLoss: grossLoss.toFixed(2),
    profitFactor: grossLoss.isZero() ? null : grossProfit.dividedBy(grossLoss).toNumber(),
    winRate: (winners.length / values.length) * 100,
    averageWin: averageWin?.toFixed(2) ?? null,
    averageLoss: averageLoss?.toFixed(2) ?? null,
    winLossRatio,
    breakEvenWinRate: winLossRatio === null ? null : 100 / (1 + winLossRatio),
    bestTrade: sorted[sorted.length - 1]!.toFixed(2),
    worstTrade: sorted[0]!.toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    curve,
    drawdown,
  };
}
