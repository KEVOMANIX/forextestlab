/**
 * Compute a full results view for a session from its persisted engine state.
 * Server-only. Does not need the candle series (works from stored state).
 */

import "server-only";

import { prisma } from "@/lib/db";
import { computeStatistics, type PerformanceStats } from "./statistics";
import type { SessionState } from "./types";
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
  const familyRows = await prisma.backtestSession.findMany({
    where: {
      userId,
      anonymous: false,
      OR: [{ id: rootId }, { branchRootId: rootId }],
    },
    orderBy: { createdAt: "asc" },
  });
  const reviewRows = await prisma.backtestSession.findMany({
    where: { userId, anonymous: false },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
  const reviewSessions = reviewRows.map((session) => {
    const sessionState = normalizeSessionState(
      JSON.parse(session.stateJson) as SessionState,
    );
    return {
      sessionId: session.id,
      name:
        sessionState.config.name?.trim() ||
        `${session.symbol} backtest`,
      symbol: session.symbol,
      timeframe: session.timeframe,
      createdAt: session.createdAt.toISOString(),
      parentSessionId: session.parentSessionId,
      branchRootId: session.branchRootId,
      startingBalance: sessionState.config.startingBalance,
      endingBalance: sessionState.balance,
      trades: sessionState.closedTrades.map((trade) => ({
        ...trade,
        journal: trade.journal
          ? {
              ...trade.journal,
              beforeEntrySnapshot: null,
              afterExitSnapshot: null,
            }
          : undefined,
      })),
    };
  });
  const branchComparison = familyRows.map((family) => {
    const familyState = normalizeSessionState(JSON.parse(family.stateJson) as SessionState);
    const familyStats = computeStatistics({
      startingBalance: familyState.config.startingBalance,
      endingBalance: familyState.balance,
      trades: familyState.closedTrades,
      equityCurve: familyState.equityCurve,
    });
    return {
      sessionId: family.id,
      name: familyState.config.name?.trim() || `${family.symbol} backtest`,
      parentSessionId: family.parentSessionId,
      branchPointIndex: family.branchPointIndex,
      branchPointTime: family.branchPointTime ? Number(family.branchPointTime) : null,
      status: family.status,
      trades: familyState.closedTrades.length,
      balance: familyState.balance,
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
