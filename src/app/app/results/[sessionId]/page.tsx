import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronDown, LockKeyhole, Plus } from "lucide-react";

import { AiInsightsPanel } from "@/components/app/AiInsightsPanel";
import { BackLink } from "@/components/app/BackLink";
import { ExportTradesButton } from "@/components/app/ExportTradesButton";
import { SessionAnalyticsWorkbench } from "@/components/app/SessionAnalyticsWorkbench";
import { SessionCardActions } from "@/components/app/SessionCardActions";
import { SessionTradeJournal } from "@/components/app/SessionTradeJournal";
import { SessionFeedback } from "@/components/app/SessionFeedback";
import { BranchComparison } from "@/components/app/BranchComparison";
import { SESSION_SUGGESTED_QUESTIONS } from "@/lib/ai/context";
import { requireUser } from "@/lib/auth";
import { getSessionResults } from "@/lib/backtest/results";
import { formatNewYorkDate } from "@/lib/date-time";
import { formatSymbol } from "@/lib/market-data/symbols";
import { getUserEntitlements } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Session analytics",
  robots: { index: false, follow: false },
};

export default async function ResultsPage(props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const user = await requireUser(`/app/results/${params.sessionId}`);
  const results = await getSessionResults(params.sessionId, user.id);
  if (!results) notFound();
  const entitlements = await getUserEntitlements(user.id);

  const { state } = results;
  const archived = state.config.archived === true;
  const progress = state.totalCandles
    ? Math.min(100, ((state.visibleIndex + 1) / state.totalCandles) * 100)
    : 0;

  return (
    <div className="analytics-workspace mx-auto max-w-[1480px] px-4 py-6 sm:px-6 sm:py-7">
      <BackLink label="Back to dashboard" fallback="/app" />

      <header className="mt-4 border-b app-border pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] app-muted">Session report</p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{results.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs app-muted">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--app-text)]"><i className={`h-1.5 w-1.5 rounded-full ${state.status === "finished" ? "bg-brand-400" : "bg-amber-400"}`} />{state.status === "finished" ? "Completed" : "Active"}</span>
              <span className="font-mono font-semibold text-[var(--app-text)]">{results.symbols.map(formatSymbol).join(" · ")}</span>
              <span>{formatNewYorkDate(state.config.startTime)} – {formatNewYorkDate(state.config.endTime)}</span>
              <span>New York time</span>
              <span className="inline-flex items-center gap-2"><span>Replay {progress.toFixed(0)}%</span><span className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.08]"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></span></span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SessionCardActions sessionId={results.sessionId} sessionName={results.name} status={state.status} archived={archived} showAnalytics={false} compact command />
            {entitlements.csvExports ? <ExportTradesButton trades={state.closedTrades} symbol={results.symbol} sessionId={results.sessionId} compact /> : <Link href="/account/billing" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted hover:bg-white/[0.05]" title="CSV exports are included with Pro"><LockKeyhole size={14} aria-hidden /> Export</Link>}
            <Link href="/app/backtest" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted hover:bg-white/[0.05] hover:text-[var(--app-text)]"><Plus size={14} /> New session</Link>
          </div>
        </div>
      </header>

      {results.hasAmbiguousTrades && (
        <div role="note" className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Some trades touched SL and TP within one candle. The {state.config.executionPolicy} execution policy determined those outcomes because minute candles cannot reveal intrabar order.</span>
        </div>
      )}

      <SessionAnalyticsWorkbench
        trades={state.closedTrades}
        equityCurve={state.equityCurve}
        startingBalance={state.config.startingBalance}
        fullAccess={entitlements.fullAnalytics}
        currentSessionId={results.sessionId}
        sessions={results.reviewSessions}
      />

      <div id="trade-journal" className="scroll-mt-24">
        <SessionTradeJournal sessionId={results.sessionId} initialTrades={state.closedTrades} collapsible />
      </div>
      <BranchComparison currentId={results.sessionId} branches={results.branchComparison} />
      {state.status === "finished" && <SessionFeedback sessionId={results.sessionId} />}

      <div id="ai-review" className="mt-6 scroll-mt-24">
        {entitlements.fullAnalytics ? (
          <AiInsightsPanel
            scope="session"
            sessionId={results.sessionId}
            suggestions={SESSION_SUGGESTED_QUESTIONS}
            title="Ask this session"
            subtitle="AI analysis grounded in this backtest"
          />
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-brand-400/25 bg-brand-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Ask your results with AI</p>
              <p className="mt-1 text-xs app-muted">Pro adds an AI analyst that answers questions about this session and recommends improvements.</p>
            </div>
            <Link href="/account/billing" className="btn-primary shrink-0 px-4 py-2 text-xs">View Pro plans</Link>
          </div>
        )}
      </div>

      <details className="panel group mt-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
          Session details and notes
          <ChevronDown size={16} className="app-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t app-border p-5">
          <dl className="grid grid-cols-2 gap-4 font-mono text-xs sm:grid-cols-4">
            <div><dt className="app-muted">Starting balance</dt><dd className="mt-1">${state.config.startingBalance}</dd></div>
            <div><dt className="app-muted">Ending balance</dt><dd className="mt-1">${state.balance}</dd></div>
            <div><dt className="app-muted">Spread</dt><dd className="mt-1">{state.config.spreadPips} pips</dd></div>
            <div><dt className="app-muted">Commission/lot</dt><dd className="mt-1">${state.config.commissionPerLot}</dd></div>
            <div><dt className="app-muted">Slippage</dt><dd className="mt-1">{state.config.slippagePips} pips</dd></div>
            <div><dt className="app-muted">Execution policy</dt><dd className="mt-1 capitalize">{state.config.executionPolicy}</dd></div>
            <div><dt className="app-muted">Data source</dt><dd className="mt-1">{results.dataSource}</dd></div>
            <div><dt className="app-muted">Markets</dt><dd className="mt-1">{results.symbols.length}</dd></div>
          </dl>
          <div className="mt-5 border-t app-border pt-4">
            <p className="text-xs font-semibold app-muted">Session notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{results.notes || "No notes were saved for this session."}</p>
          </div>
        </div>
      </details>
    </div>
  );
}
