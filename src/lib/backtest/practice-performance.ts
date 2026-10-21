/**
 * Headline results over a trader's practice trades for a chosen period.
 *
 * Win rate alone misleads: a 43% win rate is profitable when winners are 2.5×
 * the size of losers. These figures put the size of wins and losses beside it,
 * and the cumulative curve shows how the result was reached.
 */

import { Decimal } from "@/lib/decimal";

export const PERFORMANCE_PERIODS = ["30d", "90d", "all"] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];
/** Remembers the trader's last choice between visits. */
export const PERFORMANCE_PERIOD_COOKIE = "ftl_performance_period";
export const PERIOD_LABELS: Record<PerformancePeriod, string> = { "30d": "30 days", "90d": "90 days", all: "All time" };

export function parsePerformancePeriod(value: string | null | undefined): PerformancePeriod | null {
  return (PERFORMANCE_PERIODS as readonly string[]).includes(value ?? "") ? (value as PerformancePeriod) : null;
}

/** When the period starts, or null for all time. Measured on when trades closed. */
export function periodStart(period: PerformancePeriod, now = Date.now()): Date | null {
  if (period === "all") return null;
  return new Date(now - (period === "30d" ? 30 : 90) * 24 * 60 * 60_000);
}

export interface PerformanceAggregates {
  tradeCount: number;
  wins: number;
  losses: number;
  netPnl: string;
  grossProfit: string;
  /** Total of losing trades, as a positive amount. */
  grossLoss: string;
  bestTrade: string;
  worstTrade: string;
  /** Largest fall from a running peak of cumulative P/L, as a positive amount. */
  maxDrawdown: string;
  /**
   * Cumulative P/L after trade `n` (1-based, oldest first). May be sampled for
   * long histories, but always holds the last trade and the drawdown trough.
   */
  curve: Array<{ n: number; total: number }>;
  /** Trade at the bottom of the largest drawdown; null when there was none. */
  troughN: number | null;
}

export interface PracticePerformance extends PerformanceAggregates {
  period: PerformancePeriod;
  /** Net P/L per trade — expectancy, in plain words. */
  averagePerTrade: string;
  /** Gross profit over gross loss; null without a losing trade. */
  profitFactor: number | null;
  winRate: number;
  averageWin: string | null;
  averageLoss: string | null;
  /** Average win over average loss; null unless both exist. */
  winLossRatio: number | null;
  /** Win rate at which this win/loss ratio exactly breaks even. */
  breakEvenWinRate: number | null;
}

export function describePerformance(period: PerformancePeriod, aggregates: PerformanceAggregates): PracticePerformance {
  const grossProfit = new Decimal(aggregates.grossProfit);
  const grossLoss = new Decimal(aggregates.grossLoss);
  const averageWin = aggregates.wins ? grossProfit.dividedBy(aggregates.wins) : null;
  const averageLoss = aggregates.losses ? grossLoss.dividedBy(aggregates.losses) : null;
  const winLossRatio = averageWin && averageLoss && !averageLoss.isZero() ? averageWin.dividedBy(averageLoss).toNumber() : null;
  return {
    ...aggregates,
    period,
    averagePerTrade: aggregates.tradeCount ? new Decimal(aggregates.netPnl).dividedBy(aggregates.tradeCount).toFixed(2) : "0.00",
    profitFactor: grossLoss.isZero() ? null : grossProfit.dividedBy(grossLoss).toNumber(),
    winRate: aggregates.tradeCount ? (aggregates.wins / aggregates.tradeCount) * 100 : 0,
    averageWin: averageWin?.toFixed(2) ?? null,
    averageLoss: averageLoss?.toFixed(2) ?? null,
    winLossRatio,
    breakEvenWinRate: winLossRatio === null ? null : 100 / (1 + winLossRatio),
  };
}

/**
 * The same aggregates the database query produces, from a list of P/L values
 * (oldest first) and without sampling. Null when there are no trades.
 */
export function aggregatesFromPnls(pnls: Array<string | number>): PerformanceAggregates | null {
  if (!pnls.length) return null;
  const values = pnls.map((pnl) => new Decimal(pnl));
  const winners = values.filter((value) => value.greaterThan(0));
  const losers = values.filter((value) => value.lessThan(0));
  const sum = (list: Decimal[]) => list.reduce((total, value) => total.plus(value), new Decimal(0));

  let running = new Decimal(0);
  let peak = new Decimal(0);
  let maxDrawdown = new Decimal(0);
  let troughN: number | null = null;
  const curve = values.map((value, index) => {
    running = running.plus(value);
    if (running.greaterThan(peak)) peak = running;
    if (peak.minus(running).greaterThan(maxDrawdown)) {
      maxDrawdown = peak.minus(running);
      troughN = index + 1;
    }
    return { n: index + 1, total: running.toNumber() };
  });
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  return {
    tradeCount: values.length,
    wins: winners.length,
    losses: losers.length,
    netPnl: sum(values).toFixed(2),
    grossProfit: sum(winners).toFixed(2),
    grossLoss: sum(losers).abs().toFixed(2),
    bestTrade: sorted[sorted.length - 1]!.toFixed(2),
    worstTrade: sorted[0]!.toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    curve,
    troughN,
  };
}
