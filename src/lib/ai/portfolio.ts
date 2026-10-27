import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { PortfolioContextSession } from "@/lib/ai/context";

interface PortfolioMetadataRow {
  id: string;
  name: string | null;
  symbols: unknown;
  archived: boolean;
}

export type PortfolioSessionRow = PortfolioContextSession & { id: string };

/** A trader's saved sessions with their trades, newest first, as the AI reads them. */
export async function loadPortfolioSessions(userId: string): Promise<PortfolioSessionRow[]> {
  const sessionRows = await prisma.backtestSession.findMany({
    where: { userId, anonymous: false },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      symbol: true,
      timeframe: true,
      status: true,
      startTime: true,
      endTime: true,
      startingBalance: true,
      depositedFunds: true,
      balance: true,
      trades: { orderBy: { exitTime: "asc" } },
      equitySnapshots: { orderBy: { index: "asc" } },
    },
  });
  if (!sessionRows.length) return [];
  const metadataRows = await prisma.$queryRaw<PortfolioMetadataRow[]>(Prisma.sql`
    SELECT "id",
           NULLIF("stateJson"::jsonb #>> '{config,name}', '') AS "name",
           COALESCE(
             "stateJson"::jsonb #> '{config,symbols}',
             jsonb_build_array("symbol")
           ) AS "symbols",
           COALESCE(
             ("stateJson"::jsonb #>> '{config,archived}')::boolean,
             false
           ) AS "archived"
    FROM "BacktestSession"
    WHERE "id" IN (${Prisma.join(sessionRows.map((session) => session.id))})
  `);
  const metadata = new Map(metadataRows.map((row) => [row.id, row]));
  return sessionRows.map((session) => {
    const details = metadata.get(session.id);
    const symbols = Array.isArray(details?.symbols)
      ? details.symbols.filter((value): value is string => typeof value === "string")
      : [];
    return {
      ...session,
      name: details?.name?.trim() || `${session.symbol} backtest`,
      symbols: symbols.length ? symbols : [session.symbol],
      archived: details?.archived ?? false,
    };
  });
}
