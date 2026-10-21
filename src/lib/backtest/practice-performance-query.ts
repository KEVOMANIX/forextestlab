import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { Decimal } from "@/lib/decimal";

import { describePerformance, periodStart, type PerformancePeriod, type PracticePerformance } from "./practice-performance";

/** Points drawn on the cumulative curve, however long the history. */
const CURVE_POINTS = 200;

interface SummaryRow {
  tradeCount: bigint;
  wins: bigint;
  losses: bigint;
  netPnl: string;
  grossProfit: string;
  grossLoss: string;
  bestTrade: string | null;
  worstTrade: string | null;
}

interface PointRow {
  n: bigint;
  total: string;
  drawdown: string;
}

/**
 * Practice performance for a period, computed in PostgreSQL.
 *
 * Only totals and at most ~200 curve points leave the database, so a trader
 * with thousands of trades costs the same egress as one with a hundred.
 * Challenges and experimental trades are excluded.
 */
export async function loadPracticePerformance(userId: string, period: PerformancePeriod): Promise<PracticePerformance | null> {
  const since = periodStart(period);
  const trades = Prisma.sql`
    SELECT trade."pnl"::numeric AS pnl, trade."createdAt" AS "closedAt", trade."id" AS id
    FROM "SimulatedTrade" AS trade
    JOIN "BacktestSession" AS session ON session."id" = trade."sessionId"
    WHERE session."userId" = ${userId}
      AND session."anonymous" = false
      AND session."challengeStatus" IS NULL
      AND trade."validity" <> 'experimental'
      ${since ? Prisma.sql`AND trade."createdAt" >= ${since}::timestamptz` : Prisma.empty}
  `;

  const [summary] = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
    WITH trades AS (${trades})
    SELECT COUNT(*)::bigint AS "tradeCount",
           COUNT(*) FILTER (WHERE pnl > 0)::bigint AS "wins",
           COUNT(*) FILTER (WHERE pnl < 0)::bigint AS "losses",
           COALESCE(SUM(pnl), 0)::text AS "netPnl",
           COALESCE(SUM(pnl) FILTER (WHERE pnl > 0), 0)::text AS "grossProfit",
           COALESCE(-SUM(pnl) FILTER (WHERE pnl < 0), 0)::text AS "grossLoss",
           MAX(pnl)::text AS "bestTrade",
           MIN(pnl)::text AS "worstTrade"
    FROM trades
  `);
  const tradeCount = Number(summary?.tradeCount ?? 0);
  if (!summary || !tradeCount) return null;

  const step = Math.max(1, Math.ceil(tradeCount / CURVE_POINTS));
  const points = await prisma.$queryRaw<PointRow[]>(Prisma.sql`
    WITH trades AS (${trades}),
    running AS (
      SELECT ROW_NUMBER() OVER ordered AS n, SUM(pnl) OVER ordered AS total
      FROM trades
      WINDOW ordered AS (ORDER BY "closedAt", id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    ),
    drawdowns AS (
      SELECT n, total,
             GREATEST(0, MAX(total) OVER (ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) - total AS drawdown
      FROM running
    ),
    trough AS (SELECT n FROM drawdowns ORDER BY drawdown DESC, n LIMIT 1)
    SELECT n, total::text AS total, drawdown::text AS drawdown
    FROM drawdowns
    WHERE n % ${step}::int = 0
       OR n = (SELECT MAX(n) FROM drawdowns)
       OR n = (SELECT n FROM trough)
    ORDER BY n
  `);

  const deepest = points.reduce<PointRow | null>((worst, point) =>
    !worst || new Decimal(point.drawdown).greaterThan(worst.drawdown) ? point : worst, null);
  const maxDrawdown = deepest ? new Decimal(deepest.drawdown) : new Decimal(0);
  return describePerformance(period, {
    tradeCount,
    wins: Number(summary.wins),
    losses: Number(summary.losses),
    netPnl: new Decimal(summary.netPnl).toFixed(2),
    grossProfit: new Decimal(summary.grossProfit).toFixed(2),
    grossLoss: new Decimal(summary.grossLoss).toFixed(2),
    bestTrade: new Decimal(summary.bestTrade ?? 0).toFixed(2),
    worstTrade: new Decimal(summary.worstTrade ?? 0).toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    curve: points.map((point) => ({ n: Number(point.n), total: Number(point.total) })),
    troughN: maxDrawdown.isZero() || !deepest ? null : Number(deepest.n),
  });
}
