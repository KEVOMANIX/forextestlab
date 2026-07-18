import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronDown, Plus } from "lucide-react";

import { BackLink } from "@/components/app/BackLink";
import { ExportTradesButton } from "@/components/app/ExportTradesButton";
import {
  DemoDataNotice,
  ImportedDataNotice,
  MarketDataNotice,
  SimulationNotice,
} from "@/components/app/LegalNotices";
import { SessionAnalyticsWorkbench } from "@/components/app/SessionAnalyticsWorkbench";
import { SessionCardActions } from "@/components/app/SessionCardActions";
import { requireUser } from "@/lib/auth";
import { getSessionResults } from "@/lib/backtest/results";
import { formatSymbol } from "@/lib/market-data/symbols";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Session analytics",
  robots: { index: false, follow: false },
};

export default async function ResultsPage({ params }: { params: { sessionId: string } }) {
  const user = await requireUser(`/app/results/${params.sessionId}`);
  const results = await getSessionResults(params.sessionId, user.id);
  if (!results) notFound();

  const { state } = results;
  const archived = state.config.archived === true;
  const progress = state.totalCandles
    ? Math.min(100, ((state.visibleIndex + 1) / state.totalCandles) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <BackLink label="Back to dashboard" fallback="/app" />

      <header className="relative mt-5 overflow-hidden rounded-2xl border border-brand-400/20 bg-[linear-gradient(135deg,rgba(34,195,160,0.11),var(--app-panel)_48%,rgba(59,107,255,0.08))] p-5 shadow-card sm:p-7">
        <div aria-hidden className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Session analytics</p>
              <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">{results.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs app-muted">
                <span className={`rounded-full px-2.5 py-1 font-semibold ${state.status === "finished" ? "bg-brand-400/10 text-brand-300" : "bg-amber-400/10 text-amber-300"}`}>{state.status === "finished" ? "Completed" : "Active"}</span>
                {results.symbols.map((symbol) => <span key={symbol} className="rounded-md border app-border bg-black/10 px-2 py-1 font-mono font-semibold">{formatSymbol(symbol)}</span>)}
                <span>{new Date(state.config.startTime).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })} – {new Date(state.config.endTime).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportTradesButton trades={state.closedTrades} symbol={results.symbol} sessionId={results.sessionId} />
              <SessionCardActions sessionId={results.sessionId} status={state.status} archived={archived} showAnalytics={false} />
              <Link href="/app/backtest" className="btn-primary px-3 py-2 text-xs"><Plus size={14} /> New session</Link>
            </div>
          </div>
          <div className="border-t app-border pt-4">
            <div className="flex items-center justify-between text-xs"><span className="font-semibold app-muted">Replay progress</span><span className="font-mono font-semibold">{progress.toFixed(0)}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div>
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
      />

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

      <details className="panel group mt-3 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold app-muted">
          Data and simulation information
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t app-border p-4">
          {results.demoData ? <DemoDataNotice /> : <ImportedDataNotice source={results.dataSource} />}
          <SimulationNotice />
          <MarketDataNotice />
        </div>
      </details>
    </div>
  );
}
