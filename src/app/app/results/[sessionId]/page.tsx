import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { EquityCurve } from "@/components/app/EquityCurve";
import { ExportTradesButton } from "@/components/app/ExportTradesButton";
import {
  DemoDataNotice,
  ImportedDataNotice,
  MarketDataNotice,
  SimulationNotice,
} from "@/components/app/LegalNotices";
import { StatsGrid } from "@/components/app/StatsGrid";
import { TradesTable } from "@/components/app/TradesTable";
import { getSessionResults } from "@/lib/backtest/results";
import { requireUser } from "@/lib/auth";
import { DeleteSessionButton } from "@/components/app/DeleteSessionButton";
import { BackLink } from "@/components/app/BackLink";
import { formatSymbol } from "@/lib/market-data/symbols";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Session results",
  robots: { index: false, follow: false },
};

export default async function ResultsPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const user = await requireUser(`/app/results/${params.sessionId}`);
  const results = await getSessionResults(params.sessionId, user.id);
  if (!results) notFound();

  const { state, stats } = results;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <BackLink label="Back to sessions" />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">
            Session analytics
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{results.name}</h1>
          <p className="mt-1 text-sm app-muted">
            {results.symbols
              .map(formatSymbol)
              .join(" · ")}
            {" · "}
            {new Date(state.config.startTime).toISOString().slice(0, 10)}
            {" – "}
            {new Date(state.config.endTime).toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="flex gap-2">
          <DeleteSessionButton sessionId={results.sessionId} />
          <ExportTradesButton
            trades={state.closedTrades}
            symbol={results.symbol}
            sessionId={results.sessionId}
          />
          <Link href="/app/backtest" className="btn-primary py-2 text-xs">
            New session
          </Link>
        </div>
      </div>
      <nav
        aria-label="Analytics sections"
        className="mt-6 flex gap-1 overflow-x-auto rounded-xl border app-border bg-[var(--app-panel)] p-1"
      >
        {([
          ["Overview", "#overview"],
          ["Trades", "#trades"],
          ["Equity", "#equity"],
          ["Pair breakdown", "#pairs"],
          ["Notes", "#notes"],
        ] as const).map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
          >
            {label}
          </Link>
        ))}
      </nav>

      {results.hasAmbiguousTrades && (
        <div
          role="note"
          className="mt-6 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            One or more trades had ambiguous intrabar sequencing: the stop-loss
            and take-profit were both within a single candle, so the configured
            &ldquo;{state.config.executionPolicy}&rdquo; execution policy decided
            the outcome. These results are not tick-accurate.
          </span>
        </div>
      )}

      <section id="overview" className="mt-8 scroll-mt-20" aria-label="Summary statistics">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide app-muted">Summary</h2>
        <StatsGrid stats={stats} />
      </section>

      <section id="equity" className="mt-8 scroll-mt-20 panel p-5" aria-label="Equity curve">
        <h2 className="mb-3 text-sm font-semibold">Equity curve</h2>
        <EquityCurve points={state.equityCurve} />
        <p className="mt-2 font-mono text-xs app-muted">
          Max drawdown: ${stats.maxDrawdown}
          {stats.maxDrawdownPercent !== "Not available" && ` (${stats.maxDrawdownPercent}%)`}
        </p>
      </section>

      <section id="trades" className="mt-8 scroll-mt-20 panel overflow-hidden" aria-label="Trade history">
        <h2 className="border-b app-border px-4 py-3 text-sm font-semibold">Trade history</h2>
        <TradesTable trades={state.closedTrades} />
      </section>

      <section id="pairs" className="mt-8 scroll-mt-20 panel p-5" aria-label="Pair breakdown">
        <h2 className="text-sm font-semibold">Pair breakdown</h2>
        <p className="mt-1 text-xs app-muted">
          Execution results currently belong to the primary pair. Other selected
          pairs are synchronized reference charts.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {results.symbols.map((symbol) => {
            const primary = symbol === results.symbol;
            return (
              <article key={symbol} className="rounded-xl border app-border bg-[var(--app-panel-2)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="font-mono">{formatSymbol(symbol)}</strong>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    primary
                      ? "bg-brand-400/10 text-brand-300"
                      : "bg-white/5 app-muted"
                  }`}>
                    {primary ? "Execution pair" : "Reference pair"}
                  </span>
                </div>
                <p className="mt-3 text-sm app-muted">
                  {primary
                    ? `${state.closedTrades.length} closed trade${state.closedTrades.length === 1 ? "" : "s"}`
                    : "No independent executions recorded"}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="notes" className="mt-8 scroll-mt-20 panel p-5" aria-label="Session details">
        <h2 className="mb-3 text-sm font-semibold">Session details</h2>
        <dl className="grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
          <div><dt className="app-muted">Starting balance</dt><dd>${state.config.startingBalance}</dd></div>
          <div><dt className="app-muted">Ending balance</dt><dd>${state.balance}</dd></div>
          <div><dt className="app-muted">Spread</dt><dd>{state.config.spreadPips} pips</dd></div>
          <div><dt className="app-muted">Commission/lot</dt><dd>${state.config.commissionPerLot}</dd></div>
          <div><dt className="app-muted">Slippage</dt><dd>{state.config.slippagePips} pips</dd></div>
          <div><dt className="app-muted">Execution policy</dt><dd>{state.config.executionPolicy}</dd></div>
          <div><dt className="app-muted">Data source</dt><dd>{results.dataSource}</dd></div>
          <div><dt className="app-muted">Pairs</dt><dd>{results.symbols.length}</dd></div>
        </dl>
        {results.notes && (
          <div className="mt-4">
            <p className="text-xs font-medium app-muted">Your notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{results.notes}</p>
          </div>
        )}
      </section>

      <div className="mt-8 space-y-2">
        {results.demoData ? (
          <DemoDataNotice />
        ) : (
          <ImportedDataNotice source={results.dataSource} />
        )}
        <SimulationNotice />
        <MarketDataNotice />
      </div>
    </div>
  );
}
