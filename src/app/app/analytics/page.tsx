import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3 } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";

import { AiInsightsPanel } from "@/components/app/AiInsightsPanel";
import { AnalyticsDesignPrototype } from "@/components/app/AnalyticsDesignPrototype";
import { BranchComparison } from "@/components/app/BranchComparison";
import { SessionFeedback } from "@/components/app/SessionFeedback";
import { SessionTradeJournal } from "@/components/app/SessionTradeJournal";
import { SESSION_SUGGESTED_QUESTIONS } from "@/lib/ai/context";
import { requireUser } from "@/lib/auth";
import { buildExitQualityReport } from "@/lib/backtest/exit-quality-server";
import { getSessionResults } from "@/lib/backtest/results";
import { fundedBalance } from "@/lib/backtest/replay-engine";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { formatSymbol } from "@/lib/market-data/symbols";

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

export default async function AnalyticsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const user = await requireUser("/app/analytics");
  const { session: requestedSessionId } = await searchParams;
  const sessions = await prisma.backtestSession.findMany({
    where: { userId: user.id, anonymous: false },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, symbol: true },
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
  const choices = sessions
    .filter((session) => !metadata.get(session.id)?.archived)
    .map((session) => {
      const details = metadata.get(session.id);
      const symbols = Array.isArray(details?.symbols)
        ? details.symbols.filter((symbol): symbol is string => typeof symbol === "string")
        : [session.symbol];
      return {
        ...session,
        name: details?.name?.trim() || `${formatSymbol(session.symbol)} backtest`,
        symbols: symbols.map(formatSymbol).join(", "),
      };
    });
  const selected = choices.find((session) => session.id === requestedSessionId) ?? choices[0] ?? null;
  const [results, entitlements] = selected
    ? await Promise.all([getSessionResults(selected.id, user.id), getUserEntitlements(user.id)])
    : [null, null];
  const exitQuality = results ? await buildExitQualityReport(results.state) : null;

  const journal = results ? (
    <div className="mt-5 overflow-hidden rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <SessionTradeJournal sessionId={results.sessionId} initialTrades={results.state.closedTrades} collapsible={false} />
    </div>
  ) : null;
  const aiPanel = results && entitlements?.fullAnalytics ? (
    <AiInsightsPanel scope="session" sessionId={results.sessionId} suggestions={SESSION_SUGGESTED_QUESTIONS} title="Ask this session" subtitle="AI analysis grounded in this backtest" />
  ) : results ? (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-400/25 bg-brand-400/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-semibold">Ask an analyst about this session</p><p className="mt-1 max-w-xl text-xs leading-5 app-muted">Pro adds an AI analyst grounded in this backtest.</p></div>
      <Link href="/account/billing" className="btn-primary shrink-0 px-4 py-2 text-xs">View Pro plans</Link>
    </div>
  ) : null;
  const reportFooter = results ? (
    <div className="mt-5 space-y-5">
      <BranchComparison currentId={results.sessionId} branches={results.branchComparison} />
      {results.state.status === "finished" && <SessionFeedback sessionId={results.sessionId} />}
    </div>
  ) : null;
  const notice = results?.hasAmbiguousTrades ? (
    <div role="note" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>Some trades touched SL and TP inside one minute candle. The {results.state.config.executionPolicy} execution policy determined those outcomes.</span>
    </div>
  ) : null;

  if (!selected || !results) {
    return <div className="dashboard-workspace mx-auto max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8"><header className="border-b app-border pb-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Analytics</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Sessions</h1></header><section className="mt-6 rounded-2xl border app-border bg-[var(--app-panel)] p-6 sm:p-8"><span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><BarChart3 size={20} aria-hidden /></span><h2 className="mt-5 text-xl font-semibold">No sessions to analyse</h2><Link href="/app/backtest" className="btn-primary mt-5">New backtest <ArrowRight size={14} aria-hidden /></Link></section></div>;
  }

  return (
    <div className="min-h-full xl:grid xl:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b app-border bg-[var(--app-sidebar)] xl:sticky xl:top-16 xl:h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:border-b-0 xl:border-r">
        <div className="px-4 py-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">Analytics</p><h1 className="mt-1 text-lg font-semibold">Sessions</h1></div>
        <nav className="flex gap-2 overflow-x-auto border-t app-border px-3 py-3 xl:block xl:space-y-1 xl:overflow-visible" aria-label="Analytics sessions">
          {choices.map((session) => {
            const active = session.id === selected.id;
            return <Link key={session.id} href={`/app/analytics?session=${encodeURIComponent(session.id)}`} aria-current={active ? "page" : undefined} className={`block min-w-48 shrink-0 rounded-xl px-3 py-3 transition-colors xl:min-w-0 ${active ? "bg-brand-400/12 text-[var(--app-text)]" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}><p className="truncate text-xs font-semibold">{session.name}</p><p className="mt-1 truncate font-mono text-[10px] opacity-75">{session.symbols}</p></Link>;
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <AnalyticsDesignPrototype
          mode="live"
          sessionId={results.sessionId}
          sessionName={results.name}
          symbols={results.symbols}
          startTime={results.state.config.startTime}
          endTime={results.state.config.endTime}
          status={results.state.status}
          trades={results.state.closedTrades}
          equityCurve={results.state.equityCurve}
          startingBalance={fundedBalance(results.state)}
          endingBalance={results.state.balance}
          fullAccess={Boolean(entitlements?.fullAnalytics)}
          journalContent={journal}
          exitQuality={exitQuality?.summary ?? null}
          aiPanel={aiPanel}
          reportFooter={reportFooter}
          notice={notice}
          showReturn={false}
        />
      </div>
    </div>
  );
}
