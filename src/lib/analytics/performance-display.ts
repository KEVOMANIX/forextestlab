import { Decimal } from "@/lib/decimal";
import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";

export function returnPercent(startingBalance: string, endingBalance: string): number {
  const start = new Decimal(startingBalance);
  return start.isZero() ? 0 : Number(new Decimal(endingBalance).minus(start).div(start).times(100).toFixed(2));
}

/** Label the data actually drawn, rather than the session's future end date. */
export function recordedChartPeriod(
  equity: EquityPoint[],
  trades: ClosedTrade[],
  startTime?: number,
): { startTime?: number; endTime?: number } {
  const times = equity.length > 1
    ? equity.map((point) => point.time)
    : [startTime, ...trades.map((trade) => trade.exitTime)];
  const valid = times.filter((time): time is number => typeof time === "number" && Number.isFinite(time));
  if (!valid.length) return {};
  return valid.reduce((range, time) => ({
    startTime: Math.min(range.startTime, time),
    endTime: Math.max(range.endTime, time),
  }), { startTime: valid[0]!, endTime: valid[0]! });
}
