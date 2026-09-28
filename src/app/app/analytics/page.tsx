import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3 } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";

import { AiInsightsPanel } from "@/components/app/AiInsightsPanel";
import { AnalyticsDesignPrototype } from "@/components/app/AnalyticsDesignPrototype";
import { AnalyticsSessionPicker } from "@/components/app/AnalyticsSessionPicker";
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
import { Decimal } from "@/lib/decimal";
import { formatSymbol } from "@/lib/market-data/symbols";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

function lastSavedLabel(value: Date): string {
  const elapsed = Math.max(0, Date.now() - value.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: value.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function replayTime(session: { startTime: bigint; endTime: bigint; visibleTime: bigint | null; visibleIndex: number; timeframe: string }) {
  if (session.visibleTime != null) return Number(session.visibleTime);
  const step = TIMEFRAME_MS[session.timeframe as keyof typeof TIMEFRAME_MS] ?? 0;
  return Math.min(Number(session.endTime), Number(session.startTime) + Math.max(0, session.visibleIndex) * step);
}

function sessionPnl(session: { balance: string; startingBalance: string; depositedFunds: string }) {
  const value = new Decimal(session.balance).minus(session.startingBalance).minus(session.depositedFunds);
  const amount = value.abs().toFixed(2);
  return { value: `${value.isZero() ? "" : value.isPositive() ? "+" : "−"}$${amount}`, positive: !value.isNegative() };
}

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
    select: { id: true, symbol: true, timeframe: true, status: true, startTime: true, endTime: true, visibleTime: true, visibleIndex: true, startingBalance: true, depositedFunds: true, balance: true, updatedAt: true },
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

  const sessionSelector = selected ? (
    <AnalyticsSessionPicker sessions={choices.map((session) => { const pnl = sessionPnl(session); return { id: session.id, name: session.name, symbols: session.symbols, status: session.status, updatedAt: lastSavedLabel(session.updatedAt), pnl: pnl.value, positive: pnl.positive }; })} selectedId={selected.id} />
  ) : null;

  if (!selected || !results) {
    return <div className="dashboard-workspace mx-auto max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8"><header className="border-b app-border pb-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Analytics</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Sessions</h1></header><section className="mt-6 rounded-2xl border app-border bg-[var(--app-panel)] p-6 sm:p-8"><span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><BarChart3 size={20} aria-hidden /></span><h2 className="mt-5 text-xl font-semibold">No sessions to analyse</h2><Link href="/app/backtest" className="btn-primary mt-5">New backtest <ArrowRight size={14} aria-hidden /></Link></section></div>;
  }

  return (
    <AnalyticsDesignPrototype
          mode="live"
          sessionId={results.sessionId}
          sessionName={results.name}
          symbols={results.symbols}
          startTime={results.state.config.startTime}
          endTime={results.state.config.endTime}
          currentTime={replayTime(selected)}
          lastSavedLabel={lastSavedLabel(selected.updatedAt)}
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
          sessionSelector={sessionSelector}
        />
  );
}
