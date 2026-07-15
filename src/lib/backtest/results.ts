/**
 * Compute a full results view for a session from its persisted engine state.
 * Server-only. Does not need the candle series (works from stored state).
 */

import "server-only";

import { prisma } from "@/lib/db";
import { computeStatistics, type PerformanceStats } from "./statistics";
import type { SessionState } from "./types";

export interface SessionResults {
  sessionId: string;
  symbol: string;
  timeframe: string;
  createdAt: string;
  dataSource: string;
  demoData: boolean;
  notes: string;
  state: SessionState;
  stats: PerformanceStats;
  hasAmbiguousTrades: boolean;
}

export async function getSessionResults(
  id: string,
): Promise<SessionResults | null> {
  const row = await prisma.backtestSession.findUnique({ where: { id } });
  if (!row) return null;

  const state = JSON.parse(row.stateJson) as SessionState;
  const stats = computeStatistics({
    startingBalance: state.config.startingBalance,
    endingBalance: state.balance,
    trades: state.closedTrades,
    equityCurve: state.equityCurve,
  });

  return {
    sessionId: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    createdAt: row.createdAt.toISOString(),
    dataSource: row.dataSource,
    demoData: row.demoData,
    notes: row.notes ?? "",
    state,
    stats,
    hasAmbiguousTrades: state.closedTrades.some((t) => t.intrabarAmbiguous),
  };
}
