import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";

import { ensureUserProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNewYorkDate } from "@/lib/date-time";
import { formatSymbol } from "@/lib/market-data/symbols";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

interface SessionMetadataRow {
  id: string;
  name: string | null;
  symbols: unknown;
  archived: boolean;
}

export default async function AnalyticsHubPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  await ensureUserProfile(user);

  const sessions = await prisma.backtestSession.findMany({
    where: { userId: user.id, anonymous: false },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, symbol: true, status: true, updatedAt: true },
  });
  const metadataRows = sessions.length
    ? await prisma.$queryRaw<SessionMetadataRow[]>(Prisma.sql`
        SELECT "id",
               NULLIF("stateJson"::jsonb #>> '{config,name}', '') AS "name",
               COALESCE("stateJson"::jsonb #> '{config,symbols}', jsonb_build_array("symbol")) AS "symbols",
               COALESCE(("stateJson"::jsonb #>> '{config,archived}')::boolean, false) AS "archived"
        FROM "BacktestSession"
        WHERE "id" IN (${Prisma.join(sessions.map((session) => session.id))})
      `)
    : [];
  const metadata = new Map(metadataRows.map((row) => [row.id, row]));
  const visibleSessions = sessions.filter((session) => !metadata.get(session.id)?.archived);

  return (
    <div className="dashboard-workspace mx-auto max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b app-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Analytics</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Sessions</h1>
      </header>

      {visibleSessions.length === 0 ? (
        <section className="mt-6 rounded-2xl border app-border bg-[var(--app-panel)] p-6 sm:p-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><BarChart3 size={20} aria-hidden /></span>
          <h2 className="mt-5 text-xl font-semibold">No sessions to analyse</h2>
          <Link href="/app/backtest" className="btn-primary mt-5">New backtest <ArrowRight size={14} aria-hidden /></Link>
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-card" aria-labelledby="analytics-sessions">
          <h2 id="analytics-sessions" className="border-b app-border px-5 py-4 text-sm font-semibold">Select a session</h2>
          <div className="divide-y app-border">
            {visibleSessions.map((session) => {
              const details = metadata.get(session.id);
              const symbols = Array.isArray(details?.symbols)
                ? details.symbols.filter((symbol): symbol is string => typeof symbol === "string")
                : [session.symbol];
              const name = details?.name?.trim() || `${formatSymbol(session.symbol)} backtest`;
              return <article key={session.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-brand-400/[0.04] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate font-semibold">{name}</p><p className="mt-1 truncate font-mono text-[11px] app-muted">{symbols.map(formatSymbol).join(", ")} · Updated {formatNewYorkDate(session.updatedAt, { day: "numeric", month: "short" })}</p></div>
                <Link href={`/app/results/${encodeURIComponent(session.id)}`} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-brand-400/35 px-3 text-xs font-semibold text-brand-300 transition-colors hover:bg-brand-400/10 sm:self-auto">Open analytics <ArrowRight size={14} aria-hidden /></Link>
              </article>;
            })}
          </div>
        </section>
      )}
    </div>
  );
}
