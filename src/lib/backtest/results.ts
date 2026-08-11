/**
 * Compute a full results view for a session from its persisted engine state.
 * Server-only. Does not need the candle series (works from stored state).
 */

import "server-only";

import { Prisma, type SimulatedTrade } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import { computeStatistics, type PerformanceStats } from "./statistics";
import type { ClosedTrade, EquityPoint, SessionState } from "./types";
import { normalizeSessionState } from "./replay-engine";

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
  reviewSessions: ReviewSession[];
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

export interface ReviewSession {
  sessionId: string;
  name: string;
  symbol: string;
  timeframe: string;
  createdAt: string;
  parentSessionId: string | null;
  branchRootId: string | null;
  startingBalance: string;
  endingBalance: string;
  trades: SessionState["closedTrades"];
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

export async function getSessionResults(
  id: string,
  userId: string,
): Promise<SessionResults | null> {
  const row = await prisma.backtestSession.findFirst({
    where: { id, userId, anonymous: false },
  });
  if (!row) return null;

  const state = normalizeSessionState(JSON.parse(row.stateJson) as SessionState);
  const stats = computeStatistics({
    startingBalance: state.config.startingBalance,
    endingBalance: state.balance,
    trades: state.closedTrades,
    equityCurve: state.equityCurve,
  });
  const rootId = row.branchRootId ?? row.id;
  // Cross-session analytics used to load and parse every complete stateJson.
  // For established accounts that is tens of megabytes and exceeds the free
  // Workers CPU budget. Relational trade/equity projections carry everything
  // needed for comparisons without transferring the replay engine snapshots.
  const [familyRows, reviewRows] = await Promise.all([
    prisma.backtestSession.findMany({
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
        balance: true,
        trades: { orderBy: { exitTime: "asc" } },
        equitySnapshots: { orderBy: { index: "asc" } },
      },
    }),
    prisma.backtestSession.findMany({
      where: { userId, anonymous: false },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: {
        id: true,
        symbol: true,
        timeframe: true,
        createdAt: true,
        parentSessionId: true,
        branchRootId: true,
        startingBalance: true,
        balance: true,
        trades: { orderBy: { exitTime: "asc" } },
      },
    }),
  ]);
  const metadataIds = [...new Set([
    ...familyRows.map((session) => session.id),
    ...reviewRows.map((session) => session.id),
  ])];
  const metadataRows = metadataIds.length
    ? await prisma.$queryRaw<SessionMetadataRow[]>(Prisma.sql`
        SELECT "id", NULLIF("stateJson"::jsonb #>> '{config,name}', '') AS "name"
        FROM "BacktestSession"
        WHERE "id" IN (${Prisma.join(metadataIds)})
      `)
    : [];
  const metadata = new Map(metadataRows.map((item) => [item.id, item]));
  const reviewSessions = reviewRows.map((session) => {
    return {
      sessionId: session.id,
      name: metadata.get(session.id)?.name?.trim() || `${session.symbol} backtest`,
      symbol: session.symbol,
      timeframe: session.timeframe,
      createdAt: session.createdAt.toISOString(),
      parentSessionId: session.parentSessionId,
      branchRootId: session.branchRootId,
      startingBalance: session.startingBalance,
      endingBalance: session.balance,
      trades: session.trades.map(toClosedTrade),
    };
  });
  const branchComparison = familyRows.map((family) => {
    const trades = family.trades.map(toClosedTrade);
    const familyStats = computeStatistics({
      startingBalance: family.startingBalance,
      endingBalance: family.balance,
      trades,
      equityCurve: family.equitySnapshots.map(toEquityPoint),
    });
    return {
      sessionId: family.id,
      name: metadata.get(family.id)?.name?.trim() || `${family.symbol} backtest`,
      parentSessionId: family.parentSessionId,
      branchPointIndex: family.branchPointIndex,
      branchPointTime: family.branchPointTime ? Number(family.branchPointTime) : null,
      status: family.status,
      trades: trades.length,
      balance: family.balance,
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
    hasAmbiguousTrades: state.closedTrades.some((t) => t.intrabarAmbiguous),
    reviewSessions,
    branchComparison,
  };
}
