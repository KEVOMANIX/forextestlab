/**
 * Compute a full results view for a session from its persisted engine state.
 * Server-only. Does not need the candle series (works from stored state).
 */

import "server-only";

import { Prisma, type SimulatedTrade } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { computeStatistics, type PerformanceStats } from "./statistics";
import type { ClosedTrade, EquityPoint, SessionState } from "./types";
import { fundedBalance } from "./replay-engine";
import { readSavedSessionState } from "./saved-session-state";
import { analyticsTrades } from "@/lib/analytics/trade-scope";

export interface SessionResults {
  sessionId: string;
  name: string;
  symbols: string[];
  symbol: string;
  timeframe: string;
  createdAt: string;
  dataSource: string;
  demoData: boolean;
  notes: string;
  state: SessionState;
  stats: PerformanceStats;
  hasAmbiguousTrades: boolean;
  branchComparison: {
    sessionId: string;
    name: string;
    parentSessionId: string | null;
    branchPointIndex: number | null;
    branchPointTime: number | null;
    status: string;
    trades: number;
    balance: string;
    netPnl: string;
    winRate: string;
  }[];
}

interface SessionMetadataRow {
  id: string;
  name: string | null;
}

function toClosedTrade(trade: SimulatedTrade): ClosedTrade {
  return {
    ...trade,
    direction: trade.direction as ClosedTrade["direction"],
    exitReason: trade.exitReason as ClosedTrade["exitReason"],
    entryTime: Number(trade.entryTime),
    exitTime: Number(trade.exitTime),
    notes: trade.notes ?? undefined,
  };
}

function toEquityPoint(point: {
  index: number;
  time: bigint;
  balance: string;
  equity: string;
}): EquityPoint {
  return {
    index: point.index,
    time: Number(point.time),
    balance: point.balance,
    equity: point.equity,
  };
}

/** Row-level equivalent of `fundedBalance`, for the projected columns. */
function fundedTotal(row: { startingBalance: string; depositedFunds: string }): string {
  return new Decimal(row.startingBalance).plus(row.depositedFunds).toFixed(2);
}

export async function getSessionResults(
  id: string,
  userId: string,
): Promise<SessionResults | null> {
  const row = await prisma.backtestSession.findFirst({
    where: { id, userId, anonymous: false },
  });
  if (!row) return null;

  const state = await readSavedSessionState(row);
  const scopedTrades = analyticsTrades(state.closedTrades);
  const scopedEndingBalance = scopedTrades.reduce(
    (sum, trade) => sum.plus(trade.pnl),
    new Decimal(fundedBalance(state)),
  ).toFixed(2);
  const stats = computeStatistics({
    // Everything the trader put in, so a demo top-up after a blown account is
    // not reported as profit.
    startingBalance: fundedBalance(state),
    endingBalance: scopedEndingBalance,
    trades: scopedTrades,
    equityCurve:
      scopedTrades.length === state.closedTrades.length ? state.equityCurve : [],
  });
  const rootId = row.branchRootId ?? row.id;
  // Cross-session analytics used to load and parse every complete stateJson.
  // For established accounts that can be tens of megabytes. Relational
  // trade/equity projections carry everything needed for comparisons without
  // transferring replay engine snapshots from PostgreSQL. (A 60-session
  // "review" set with every trade used to load here too; nothing read it.)
  // The branch names live in the snapshot config; they are read alongside,
  // with the same filter, rather than in a second round trip.
  const [familyRows, metadataRows] = await Promise.all([prisma.backtestSession.findMany({
      where: {
        userId,
        anonymous: false,
        OR: [{ id: rootId }, { branchRootId: rootId }],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        symbol: true,
        status: true,
        parentSessionId: true,
        branchPointIndex: true,
        branchPointTime: true,
        startingBalance: true,
        depositedFunds: true,
        balance: true,
        trades: { orderBy: { exitTime: "asc" } },
        equitySnapshots: { orderBy: { index: "asc" } },
      },
    }),
    prisma.$queryRaw<SessionMetadataRow[]>(Prisma.sql`
      SELECT "id", NULLIF("stateJson"::jsonb #>> '{config,name}', '') AS "name"
      FROM "BacktestSession"
      WHERE "userId" = ${userId} AND "anonymous" = false
        AND ("id" = ${rootId} OR "branchRootId" = ${rootId})
    `),
  ]);
  const metadata = new Map(metadataRows.map((item) => [item.id, item]));
  const branchComparison = familyRows.map((family) => {
    const trades = family.trades
      .filter((trade) => trade.validity !== "experimental")
      .map(toClosedTrade);
    const hasExperimentalTrades = trades.length !== family.trades.length;
    const scopedBalance = trades.reduce(
      (balance, trade) => balance.plus(trade.pnl),
      new Decimal(fundedTotal(family)),
    ).toFixed(2);
    const familyStats = computeStatistics({
      startingBalance: fundedTotal(family),
      endingBalance: scopedBalance,
      trades,
      equityCurve: hasExperimentalTrades
        ? []
        : family.equitySnapshots.map(toEquityPoint),
    });
    return {
      sessionId: family.id,
      name: metadata.get(family.id)?.name?.trim() || `${family.symbol} backtest`,
      parentSessionId: family.parentSessionId,
      branchPointIndex: family.branchPointIndex,
      branchPointTime: family.branchPointTime ? Number(family.branchPointTime) : null,
      status: family.status,
      trades: trades.length,
      balance: scopedBalance,
      netPnl: familyStats.netProfit,
      winRate: familyStats.winRate,
    };
  });

  return {
    sessionId: row.id,
    name: state.config.name?.trim() || `${row.symbol} backtest`,
    symbols: state.config.symbols?.length
      ? state.config.symbols
      : [row.symbol],
    symbol: row.symbol,
    timeframe: row.timeframe,
    createdAt: row.createdAt.toISOString(),
    dataSource: row.dataSource,
    demoData: row.demoData,
    notes: row.notes ?? "",
    state,
    stats,
    hasAmbiguousTrades: scopedTrades.some((t) => t.intrabarAmbiguous),
    branchComparison,
  };
}
