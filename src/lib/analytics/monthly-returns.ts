import type { ClosedTrade } from "@/lib/backtest/types";
import { getNewYorkDateParts } from "@/lib/date-time";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface MonthlyReturn {
  /** "2025-02" — two Februaries in different years must never merge. */
  key: string;
  label: string;
  year: number;
  /** 1-12. */
  month: number;
  profit: number;
  /** Profit as a percentage of the starting balance. */
  percent: number;
}

/**
 * One entry per calendar month the test actually covered.
 *
 * This replaces a twelve-slot array indexed by month number, which discarded
 * the year: a backtest running from 2019 to 2024 added five separate Januaries
 * into a single bar, and a two-month session drew twelve bars with ten of them
 * empty and then reported "Positive months 2 of 12" — counting ten months it
 * had never traded against you.
 *
 * Months inside the span with no trades are kept, at zero. They are real
 * months of the test that returned nothing, and dropping them would flatter
 * the consistency figure exactly as the old version deflated it.
 */
export function monthlyReturnSeries(
  trades: ClosedTrade[],
  startingBalance: number,
): MonthlyReturn[] {
  if (trades.length === 0) return [];

  const totals = new Map<string, number>();
  let first: { year: number; month: number } | null = null;
  let last: { year: number; month: number } | null = null;

  for (const trade of trades) {
    const point = getNewYorkDateParts(trade.exitTime);
    const key = monthKey(point.year, point.month);
    totals.set(key, (totals.get(key) ?? 0) + Number(trade.pnl));
    if (!first || key < monthKey(first.year, first.month)) first = point;
    if (!last || key > monthKey(last.year, last.month)) last = point;
  }

  const series: MonthlyReturn[] = [];
  let { year, month } = first!;
  while (year < last!.year || (year === last!.year && month <= last!.month)) {
    const key = monthKey(year, month);
    const profit = totals.get(key) ?? 0;
    series.push({
      key,
      label: MONTH_LABELS[month - 1]!,
      year,
      month,
      profit,
      percent: startingBalance ? (profit / startingBalance) * 100 : 0,
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return series;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
