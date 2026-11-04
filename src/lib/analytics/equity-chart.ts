import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";

export type EquityChartRange = "1M" | "3M" | "1Y" | "All";
export type PnlPoint = { time: number; value: number };

export function cumulativePnlPoints(
  equityCurve: EquityPoint[],
  trades: ClosedTrade[],
  startingBalance: number,
  startTime?: number,
): { points: PnlPoint[]; includesOpenTrades: boolean } {
  const recorded = equityCurve
    .map((point) => ({ time: point.time, value: Number(point.equity) - startingBalance }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);
  if (recorded.length > 1) return { points: recorded, includesOpenTrades: true };

  const ordered = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const firstTime = startTime ?? (ordered[0] ? ordered[0].entryTime : 0);
  let total = 0;
  const points: PnlPoint[] = [{ time: firstTime, value: 0 }];
  for (const trade of ordered) {
    total += Number(trade.pnl);
    points.push({ time: trade.exitTime, value: total });
  }
  return { points, includesOpenTrades: false };
}

export function pointsInRange(points: PnlPoint[], range: EquityChartRange): PnlPoint[] {
  if (range === "All" || points.length < 2) return points;
  const latest = points[points.length - 1]!.time;
  const cutoff = new Date(latest);
  if (range === "1Y") cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  else cutoff.setUTCMonth(cutoff.getUTCMonth() - (range === "1M" ? 1 : 3));
  const first = points.findIndex((point) => point.time >= cutoff.getTime());
  if (first <= 0) return points;
  const previous = points[first - 1]!;
  const next = points[first]!;
  if (next.time === cutoff.getTime()) return points.slice(first);
  const fraction = next.time === previous.time ? 0 : (cutoff.getTime() - previous.time) / (next.time - previous.time);
  return [{ time: cutoff.getTime(), value: previous.value + (next.value - previous.value) * fraction }, ...points.slice(first)];
}

/** Closed-trade equity holds its last value until the next exit. */
export function realisedPointsInRange(points: PnlPoint[], range: EquityChartRange): PnlPoint[] {
  if (range === "All" || points.length < 2) return points;
  const latest = points.at(-1)!.time;
  const cutoff = new Date(latest);
  if (range === "1Y") cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  else cutoff.setUTCMonth(cutoff.getUTCMonth() - (range === "1M" ? 1 : 3));
  const first = points.findIndex((point) => point.time >= cutoff.getTime());
  if (first <= 0) return points;
  return [{ time: cutoff.getTime(), value: points[first - 1]!.value }, ...points.slice(first)];
}

export function deepestDrawdown(points: PnlPoint[]): { index: number; amount: number } {
  let peak = points[0]?.value ?? 0;
  let deepest = { index: 0, amount: 0 };
  points.forEach((point, index) => {
    peak = Math.max(peak, point.value);
    const amount = peak - point.value;
    if (amount > deepest.amount) deepest = { index, amount };
  });
  return deepest;
}

/** Preserve each bucket's high and low so sampling cannot erase a drawdown. */
export function samplePnlPoints(points: PnlPoint[], maxPoints = 480): PnlPoint[] {
  if (points.length <= maxPoints) return points;
  const sampled = [points[0]!];
  const bucketSize = Math.ceil((points.length - 2) / Math.floor((maxPoints - 2) / 2));
  for (let start = 1; start < points.length - 1; start += bucketSize) {
    const bucket = points.slice(start, Math.min(points.length - 1, start + bucketSize));
    const low = bucket.reduce((best, point) => point.value < best.value ? point : best);
    const high = bucket.reduce((best, point) => point.value > best.value ? point : best);
    if (low.time <= high.time) sampled.push(low, high);
    else sampled.push(high, low);
  }
  sampled.push(points[points.length - 1]!);
  return sampled.filter((point, index) => index === 0 || point !== sampled[index - 1]);
}
