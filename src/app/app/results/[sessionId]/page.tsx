import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { AiInsightsPanel } from "@/components/app/AiInsightsPanel";
import { AnalyticsDesignPrototype } from "@/components/app/AnalyticsDesignPrototype";
import { BranchComparison } from "@/components/app/BranchComparison";
import { SessionFeedback } from "@/components/app/SessionFeedback";
import { SessionTradeJournal } from "@/components/app/SessionTradeJournal";
import { SESSION_SUGGESTED_QUESTIONS } from "@/lib/ai/context";
import { requireUser } from "@/lib/auth";
import { getSessionResults } from "@/lib/backtest/results";
import { getUserEntitlements } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Session analytics",
  robots: { index: false, follow: false },
};

export default async function ResultsPage(props: { params: Promise<{ sessionId: string }>; searchParams?: Promise<{ demo?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await requireUser(`/app/results/${params.sessionId}`);
  const results = await getSessionResults(params.sessionId, user.id);
  if (!results) notFound();
  const entitlements = await getUserEntitlements(user.id);
  const { state } = results;

  const notice = results.hasAmbiguousTrades ? (
    <div role="note" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>Some trades touched SL and TP inside one minute candle. The {state.config.executionPolicy} execution policy determined those outcomes.</span>
    </div>
  ) : null;

  const journal = (
    <div className="mt-5 overflow-hidden rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <SessionTradeJournal sessionId={results.sessionId} initialTrades={state.closedTrades} collapsible={false} />
    </div>
  );

  const reportFooter = (
    <div className="mt-5 space-y-5">
      <BranchComparison currentId={results.sessionId} branches={results.branchComparison} />
      {state.status === "finished" && <SessionFeedback sessionId={results.sessionId} />}
      {entitlements.fullAnalytics ? (
        <AiInsightsPanel scope="session" sessionId={results.sessionId} suggestions={SESSION_SUGGESTED_QUESTIONS} title="Ask this session" subtitle="AI analysis grounded in this backtest" />
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-400/25 bg-brand-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">Unlock advanced reports and AI review</p><p className="mt-1 text-xs app-muted">Pro adds the full strategy breakdown and an AI analyst grounded in this session.</p></div>
          <Link href="/account/billing" className="btn-primary shrink-0 px-4 py-2 text-xs">View Pro plans</Link>
        </div>
      )}
      <details className="rounded-2xl bg-[var(--app-panel)] p-5">
        <summary className="cursor-pointer text-sm font-semibold">Session details and notes</summary>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t app-border pt-5 font-mono text-xs sm:grid-cols-4">
          <div><dt className="app-muted">Starting balance</dt><dd className="mt-1">${state.config.startingBalance}</dd></div>
          <div><dt className="app-muted">Ending balance</dt><dd className="mt-1">${state.balance}</dd></div>
          <div><dt className="app-muted">Spread</dt><dd className="mt-1">{state.config.spreadPips} pips</dd></div>
          <div><dt className="app-muted">Commission / lot</dt><dd className="mt-1">${state.config.commissionPerLot}</dd></div>
          <div><dt className="app-muted">Slippage</dt><dd className="mt-1">{state.config.slippagePips} pips</dd></div>
          <div><dt className="app-muted">Execution</dt><dd className="mt-1 capitalize">{state.config.executionPolicy}</dd></div>
          <div><dt className="app-muted">Data source</dt><dd className="mt-1">{results.dataSource}</dd></div>
          <div><dt className="app-muted">Markets</dt><dd className="mt-1">{results.symbols.length}</dd></div>
        </dl>
        <div className="mt-5 border-t app-border pt-4"><p className="text-xs font-semibold app-muted">Session notes</p><p className="mt-2 whitespace-pre-wrap text-sm">{results.notes || "No notes were saved for this session."}</p></div>
      </details>
    </div>
  );

  return (
    <AnalyticsDesignPrototype
      mode="live"
      initialDemo={searchParams?.demo === "1"}
      sessionId={results.sessionId}
      sessionName={results.name}
      symbols={results.symbols}
      startTime={state.config.startTime}
      endTime={state.config.endTime}
      status={state.status}
      trades={state.closedTrades}
      equityCurve={state.equityCurve}
      startingBalance={state.config.startingBalance}
      fullAccess={entitlements.fullAnalytics}
      journalContent={journal}
      reportFooter={reportFooter}
      notice={notice}
    />
  );
}
