"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Crown,
  FlaskConical,
  Gauge,
  ListChecks,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { DashboardSessionSwitcher } from "@/components/app/DashboardSessionSwitcher";
import { DashboardReviewWorkspace, type DashboardInsight } from "@/components/app/DashboardReviewWorkspace";
import {
  DashboardSessionsTable,
  type DashboardSessionRow,
} from "@/components/app/DashboardSessionsTable";
import { SessionCardActions } from "@/components/app/SessionCardActions";
import { SessionPerformanceChart } from "@/components/app/SessionPerformanceChart";
import { DEMO_ANALYTICS_EQUITY_CURVE, DEMO_ANALYTICS_TRADES } from "@/lib/analytics/demo-data";
import { computeStatistics } from "@/lib/backtest/statistics";
import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import {
  formatNewYorkDate,
  formatNewYorkDateTime,
  getNewYorkDateParts,
  getTradingSession,
} from "@/lib/date-time";
import { Decimal } from "@/lib/decimal";
import { formatSymbol } from "@/lib/market-data/symbols";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface DashboardSession {
  id: string;
  symbol: string;
  symbols: string[];
  name: string;
  timeframe: string;
  startTime: bigint;
  endTime: bigint;
  status: string;
  visibleIndex: number;
  totalCandles: number;
  startingBalance: string;
  balance: string;
  maxDrawdown: string;
  maxDrawdownPercent: string;
  updatedAt: Date;
  archived: boolean;
}

/** Signed, for a profit or loss where the direction is the point. */
function formatMoney(value: Decimal): string {
  const sign = value.isPositive() ? "+" : value.isNegative() ? "−" : "";
  // formatBalance signs negatives itself, so hand it the magnitude.
  return `${sign}${formatBalance(value.abs())}`;
}

/**
 * Unsigned, for a balance. A balance is always a positive number, so a "+"
 * in front of it says nothing about the session and reads as a gain — which
 * it is not when the account has fallen below where it started.
 */
function formatBalance(value: Decimal): string {
  const [whole, frac] = value.abs().toFixed(2).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value.isNegative() ? "−" : ""}$${grouped}.${frac}`;
}

/** "3 hours ago" beats a second absolute timestamp beside a market one. */
function savedAgo(value: Date | string | number): string {
  const then = new Date(value).getTime();
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatNewYorkDate(then);
}

function sessionProgress(session: DashboardSession | null): number {
  if (!session?.totalCandles) return session?.status === "finished" ? 100 : 0;
  return Math.min(
    100,
    Math.max(0, ((session.visibleIndex + 1) / session.totalCandles) * 100),
  );
}

function aggregateTradePnl<T extends string | number>(
  trades: ClosedTrade[],
  keyFor: (trade: ClosedTrade) => T,
): Array<{ key: T; pnl: Decimal; count: number }> {
  const values = new Map<T, { pnl: Decimal; count: number }>();
  trades.forEach((trade) => {
    const key = keyFor(trade);
    const current = values.get(key) ?? { pnl: new Decimal(0), count: 0 };
    values.set(key, {
      pnl: current.pnl.plus(trade.pnl),
      count: current.count + 1,
    });
  });
  return [...values.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => right.pnl.comparedTo(left.pnl));
}

export function SignedInDashboard({
  sessions,
  selectedTrades,
  selectedEquityCurve: realEquityCurve,
  displayName,
  selectedId,
  aiEnabled = false,
}: {
  sessions: DashboardSession[];
  selectedTrades: ClosedTrade[];
  selectedEquityCurve: EquityPoint[];
  displayName: string;
  selectedId?: string | null;
  aiEnabled?: boolean;
}) {
  const [showDemoData, setShowDemoData] = useState(false);
  const realSelectedSession =
    sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  const demoSession: DashboardSession = {
    id: realSelectedSession?.id ?? "demo-preview",
    symbol: realSelectedSession?.symbol ?? "EURUSD",
    symbols: realSelectedSession?.symbols?.length ? realSelectedSession.symbols : ["EURUSD"],
    name: "London-session breakout — sample",
    timeframe: realSelectedSession?.timeframe ?? "15m",
    startTime: BigInt(Date.UTC(2025, 1, 1)),
    endTime: BigInt(Date.UTC(2025, 1, 28, 23, 59)),
    status: "finished",
    visibleIndex: 999,
    totalCandles: 1000,
    startingBalance: "100000",
    balance: "104820",
    maxDrawdown: "1492",
    maxDrawdownPercent: "1.49",
    updatedAt: new Date(Date.UTC(2025, 1, 28, 18, 0)),
    archived: false,
  };
  const selectedSession = showDemoData ? demoSession : realSelectedSession;
  const scopeLabel = selectedSession?.name ?? "No session selected";
  const selectedSymbols = selectedSession?.symbols ?? [];
  const progress = sessionProgress(selectedSession);
  // The card used to show a balance and a starting balance and leave the
  // subtraction to the reader; these give it the number it was missing.
  const sessionNet = selectedSession
    ? new Decimal(selectedSession.balance).minus(selectedSession.startingBalance)
    : new Decimal(0);
  const sessionReturnPercent =
    selectedSession && !new Decimal(selectedSession.startingBalance).isZero()
      ? sessionNet.dividedBy(selectedSession.startingBalance).times(100).toNumber()
      : null;
  const trades = showDemoData ? DEMO_ANALYTICS_TRADES : selectedTrades;
  const selectedEquityCurve = showDemoData ? DEMO_ANALYTICS_EQUITY_CURVE : realEquityCurve;
  const wins = trades.filter((trade) => new Decimal(trade.pnl).gt(0)).length;
  const losses = trades.filter((trade) => new Decimal(trade.pnl).lt(0)).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const totalNet = selectedSession
    ? new Decimal(selectedSession.balance).minus(selectedSession.startingBalance)
    : new Decimal(0);
  const startingBalance = new Decimal(selectedSession?.startingBalance ?? 0);
  const netPercent = startingBalance.isZero()
    ? new Decimal(0)
    : totalNet.dividedBy(startingBalance).times(100);
  const stats =
    selectedSession
      ? computeStatistics({
          startingBalance: selectedSession.startingBalance,
          endingBalance: selectedSession.balance,
          trades,
          equityCurve: selectedEquityCurve,
        })
      : null;
  const recordedChartPoints = selectedEquityCurve.map((point) => ({
      time: point.time,
      balance: Number(point.balance),
      equity: Number(point.equity),
    }));
  const chartPoints =
    recordedChartPoints.length >= 2 || !selectedSession || trades.length === 0
      ? recordedChartPoints
      : [
          {
            time: Number(selectedSession.startTime),
            balance: Number(selectedSession.startingBalance),
            equity: Number(selectedSession.startingBalance),
          },
          ...[...trades]
            .sort((left, right) => left.exitTime - right.exitTime)
            .map((trade, index, sorted) => {
              const balance = sorted
                .slice(0, index + 1)
                .reduce(
                  (value, item) => value.plus(item.pnl),
                  new Decimal(selectedSession.startingBalance),
                );
              return {
                time: trade.exitTime,
                balance: balance.toNumber(),
                equity: balance.toNumber(),
              };
            }),
        ];
  const chartTrades = trades.map((trade) => ({
    time: trade.exitTime,
    pnl: Number(trade.pnl),
  }));

  const lastReplayTime =
    selectedSession
      ? Math.min(
          Number(selectedSession.endTime),
          Number(selectedSession.startTime) +
            Math.max(0, selectedSession.visibleIndex) *
              (TIMEFRAME_MS[selectedSession.timeframe as keyof typeof TIMEFRAME_MS] ?? 0),
        )
      : null;

  const dayLeaders = aggregateTradePnl(
    trades,
    (trade) => getNewYorkDateParts(trade.exitTime).weekday,
  );
  const marketSessionLeaders = aggregateTradePnl(trades, (trade) =>
    getTradingSession(trade.entryTime),
  );

  const insightCards: DashboardInsight[] = trades.length >= 5
    ? [
        {
          icon: "trophy",
          title: `${WEEKDAYS[Number(dayLeaders[0]?.key ?? 0)]} is your strongest day`,
          detail: `${formatMoney(dayLeaders[0]?.pnl ?? new Decimal(0))} across ${dayLeaders[0]?.count ?? 0} closed trade${dayLeaders[0]?.count === 1 ? "" : "s"}.`,
        },
        {
          icon: "clock",
          title: `${marketSessionLeaders[0]?.key ?? "New York"} leads your session results`,
          detail: `${formatMoney(marketSessionLeaders[0]?.pnl ?? new Decimal(0))} from ${marketSessionLeaders[0]?.count ?? 0} trade${marketSessionLeaders[0]?.count === 1 ? "" : "s"} entered in this market window.`,
        },
        {
          icon: "gauge",
          title:
            stats?.expectancy === "Not available"
              ? "Build a larger trade sample"
              : `${formatMoney(new Decimal(stats?.expectancy ?? 0))} expectancy per trade`,
          detail:
            stats?.profitFactor === "Not available"
              ? "Close both winning and losing trades to establish a profit factor."
              : `Profit factor ${stats?.profitFactor} · average risk/reward ${stats?.averageRiskReward}.`,
        },
      ]
    : trades.length
      ? [
          {
            icon: "target",
            title: `${trades.length} of 10 trades recorded`,
            detail: "Keep building the sample before relying on day or session patterns.",
          },
          {
            icon: "gauge",
            title: `${formatMoney(totalNet)} from the current sample`,
            detail: `${wins} win${wins === 1 ? "" : "s"} and ${losses} loss${losses === 1 ? "" : "es"} so far. Treat this as an early signal.`,
          },
          {
            icon: "play",
            title: `${progress.toFixed(0)}% replay coverage`,
            detail: `Close ${Math.max(0, 10 - trades.length)} more trade${10 - trades.length === 1 ? "" : "s"} to unlock stronger comparisons.`,
          },
        ]
      : [
        {
          icon: "play",
          title: "Resume replay and place your first trade",
          detail: "Insights become specific to this session as you close positions.",
        },
        {
          icon: "target",
          title: `${progress.toFixed(0)}% of the replay completed`,
          detail: "Continue from the last saved candle whenever you are ready.",
        },
        {
          icon: "lightbulb",
          title: "Use notes to capture the reason behind each decision",
          detail: "A consistent record makes the analytics more useful later.",
        },
        ];

  const recentTradeActivity = [...trades]
    .sort((left, right) => right.exitTime - left.exitTime)
    .slice(0, 4);

  const sessionOptions = sessions.map((session) => {
    const net = new Decimal(session.balance).minus(session.startingBalance);
    return {
      id: session.id,
      name: session.name,
      symbols: session.symbols.map(formatSymbol).join(", "),
      status: session.status === "finished" ? "Completed" : "Active",
      updatedAt: formatNewYorkDate(session.updatedAt, {
        day: "numeric",
        month: "short",
      }),
      pnl: formatMoney(net),
      positive: net.gte(0),
    };
  });

  const sessionRows: DashboardSessionRow[] = sessions
    .map((session) => {
      if (session.archived) return null;
      const net = new Decimal(session.balance).minus(session.startingBalance);
      return {
        id: session.id,
        name: session.name,
        symbols: session.symbols.map(formatSymbol).join(", "),
        dateRange: `${formatNewYorkDate(Number(session.startTime), {
          day: "numeric",
          month: "short",
        })} – ${formatNewYorkDate(Number(session.endTime), {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`,
        status:
          session.status === "finished"
            ? ("Completed" as const)
            : ("Active" as const),
        updatedAt: session.updatedAt.getTime(),
        updatedLabel: `Updated ${formatNewYorkDate(session.updatedAt, {
          day: "numeric",
          month: "short",
        })}`,
        pnl: net.toNumber(),
        pnlLabel: formatMoney(net),
        progress: sessionProgress(session),
        archived: false,
      };
    })
    .filter((session): session is DashboardSessionRow => session !== null);

  const netPositive = !totalNet.isNegative();
  const summaryCards: {
    label: string;
    value: string;
    detail: string;
    icon: typeof TrendingUp;
    tone: string;
    accent: string;
    visual?: React.ReactNode;
  }[] = [
    {
      label: "Net P/L",
      value: formatMoney(totalNet),
      detail: `${netPercent.gte(0) ? "+" : "−"}${netPercent.abs().toFixed(2)}% from starting balance`,
      icon: totalNet.isNegative() ? TrendingDown : TrendingUp,
      tone: totalNet.isNegative() ? "text-bear" : "text-brand-300",
      accent: totalNet.isNegative() ? "bg-bear/60" : "bg-brand-400/60",
    },
    {
      label: "Win rate",
      value: trades.length ? `${winRate.toFixed(1)}%` : "—",
      detail: trades.length ? `${wins} wins · ${losses} losses` : "No closed trades",
      icon: Gauge,
      tone: "text-amber-300",
      accent: "bg-amber-400/60",
      visual: trades.length ? (
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-bear/40">
          <div className="h-full bg-brand-500" style={{ width: `${winRate}%` }} />
        </div>
      ) : undefined,
    },
    {
      label: "Total trades",
      value: String(trades.length),
      detail:
        stats?.expectancy === "Not available"
          ? "Build your sample"
          : `${stats?.expectancy ?? "$0.00"} average result`,
      icon: Target,
      tone: "text-accent-400",
      accent: "bg-accent-400/60",
    },
    {
      label: "Maximum drawdown",
      value: stats ? `$${stats.maxDrawdown}` : "$0.00",
      detail: stats ? `${stats.maxDrawdownPercent}% from peak equity` : "No drawdown",
      icon: TrendingDown,
      tone: "text-bear",
      accent: "bg-bear/60",
      visual: stats ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-bear/80"
            style={{ width: `${Math.min(100, Number(stats.maxDrawdownPercent) || 0)}%` }}
          />
        </div>
      ) : undefined,
    },
  ];

  return (
    <div className="dashboard-workspace mx-auto max-w-[1480px] px-4 py-6 sm:px-6 sm:py-7">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
              Strategy workspace
            </p>
            {aiEnabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                <Crown size={11} aria-hidden /> Pro
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back, {displayName}
          </h1>
          <p className="mt-2 text-sm app-muted">
            Your strategy command center for replay, review, and improvement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDemoData((value) => !value)}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-xs font-semibold transition-colors ${showDemoData ? "border-amber-300/35 bg-amber-300/[0.12] text-amber-200" : "border-brand-400/25 bg-brand-400/[0.07] text-brand-300 hover:bg-brand-400/[0.12]"}`}
            title={showDemoData ? "Return to your saved session data" : "Preview a complete dashboard with sample trades"}
          >
            <FlaskConical size={15} aria-hidden /> {showDemoData ? "Show my data" : "Show sample data"}
          </button>
          <Link href="/app/backtest" className={`${selectedSession ? "btn-secondary" : "btn-primary shadow-glow"} shrink-0 px-4 py-2.5 text-xs`}>
            <Plus size={16} aria-hidden /> New backtest
          </Link>
        </div>
      </header>

      {showDemoData && <div role="note" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-xs text-amber-100"><span><strong>Sample data is on.</strong> The dashboard is previewing a completed strategy. Your saved sessions have not been changed.</span><button type="button" onClick={() => setShowDemoData(false)} className="shrink-0 font-semibold underline underline-offset-2">Use my data</button></div>}

      {!selectedSession ? (
        <section className="relative mt-7 overflow-hidden rounded-3xl border border-brand-400/20 bg-[linear-gradient(135deg,rgba(34,195,160,0.12),var(--app-panel)_48%,rgba(59,107,255,0.09))] p-6 shadow-card sm:p-9">
          <div
            aria-hidden
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl"
          />
          <div className="relative">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-brand-400/25 bg-brand-400/10 text-brand-300">
              <ListChecks size={22} aria-hidden />
            </span>
            <h2 className="mt-5 text-2xl font-bold tracking-tight">
              Create your first backtest
            </h2>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                ["1", "Choose a market", "Select the pair and historical period."],
                ["2", "Replay and trade", "Practise without seeing future candles."],
                ["3", "Review the evidence", "Use analytics to refine your process."],
              ].map(([number, title, detail]) => (
                <div
                  key={number}
                  className="rounded-2xl border app-border bg-[var(--app-panel-2)]/60 p-4"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-xs font-bold text-surface-950">
                    {number}
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm app-muted">{detail}</p>
                </div>
              ))}
            </div>
            <Link href="/app/backtest" className="btn-primary mt-6">
              Start backtesting <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section
            className="relative mt-5 overflow-hidden rounded-2xl border border-brand-300/30 bg-[linear-gradient(125deg,rgba(34,195,160,0.12),var(--app-panel)_46%,rgba(59,107,255,0.10))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-5"
            aria-label="Selected dashboard session"
          >
            <div
              aria-hidden
              className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-400/15 blur-3xl"
            />
            <div className="relative">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-300 shadow-[0_0_12px_rgba(34,195,160,0.9)]" aria-hidden />
                    {selectedSession.status === "finished"
                      ? "Review completed session"
                      : "Continue where you stopped"}
                  </p>
                  <h2 className="mt-1.5 truncate text-2xl font-bold tracking-tight">
                    {scopeLabel}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs app-muted">
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        selectedSession.status === "finished"
                          ? "bg-brand-400/10 text-brand-300"
                          : "bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      {selectedSession.status === "finished" ? "Completed" : "Active"}
                    </span>
                    {/* The first symbol is the session's active chart. The
                        rest collapse, so eight pairs cannot push the card
                        onto a second line or bury which one is in play. */}
                    {selectedSymbols.slice(0, 1).map((symbol) => (
                      <span
                        key={symbol}
                        className="rounded-md border border-brand-400/30 bg-brand-400/10 px-2 py-1 font-mono font-semibold text-brand-200"
                      >
                        {formatSymbol(symbol)}
                      </span>
                    ))}
                    {selectedSymbols.length > 1 && (
                      <span
                        className="rounded-md border app-border bg-black/10 px-2 py-1 font-mono font-semibold"
                        title={selectedSymbols.slice(1).map(formatSymbol).join(", ")}
                      >
                        +{selectedSymbols.length - 1}
                      </span>
                    )}
                    <span className="text-[11px]">
                      {formatNewYorkDate(Number(selectedSession.startTime))} –{" "}
                      {formatNewYorkDate(Number(selectedSession.endTime))}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {showDemoData ? realSelectedSession && <Link href={`/app/results/${realSelectedSession.id}?demo=1`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-xs font-bold text-surface-950 shadow-sm hover:bg-brand-400">Open full sample analytics <ArrowRight size={14} aria-hidden /></Link> : <><DashboardSessionSwitcher selectedId={selectedSession.id} sessions={sessionOptions} /><SessionCardActions sessionId={selectedSession.id} sessionName={scopeLabel} status={selectedSession.status} archived={selectedSession.archived} compact command /></>}
                </div>
              </div>

              {/* Four equal cells. Net P/L is the one a trader opens the
                  dashboard for, and it used to be absent: the card showed a
                  balance and a starting balance and left the subtraction to
                  the reader. */}
              <div className="mt-4 grid gap-px overflow-hidden rounded-xl border app-border bg-[var(--app-border)] sm:grid-cols-3">
                <div className="bg-[var(--app-panel)]/90 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold app-muted">Replay progress</span>
                    <span className="font-mono font-semibold">{progress.toFixed(0)}%</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] app-muted">
                    {selectedSession.totalCandles
                      ? `Candle ${(selectedSession.visibleIndex + 1).toLocaleString()} of ${selectedSession.totalCandles.toLocaleString()}`
                      : selectedSession.status === "finished"
                        ? "Session complete"
                        : "Not started"}
                  </p>
                </div>
                <div className="bg-[var(--app-panel)]/90 p-3.5">
                  <p className="text-xs font-semibold app-muted">Current balance</p>
                  <p className="mt-1.5 font-mono text-base font-semibold">
                    {formatBalance(new Decimal(selectedSession.balance))}
                  </p>
                  <p className="mt-1 text-[11px] app-muted">
                    <span className={sessionNet.isNegative() ? "font-semibold text-bear" : sessionNet.isZero() ? "" : "font-semibold text-brand-300"}>
                      {formatMoney(sessionNet)}
                      {sessionReturnPercent === null ? "" : ` (${sessionNet.isNegative() ? "−" : sessionNet.isZero() ? "" : "+"}${Math.abs(sessionReturnPercent).toFixed(2)}%)`}
                    </span>{" "}
                    from {formatBalance(new Decimal(selectedSession.startingBalance))}
                  </p>
                </div>
                <div className="bg-[var(--app-panel)]/90 p-3.5">
                  <p className="text-xs font-semibold app-muted">Replay position</p>
                  <p className="mt-1.5 text-sm font-semibold">
                    {lastReplayTime ? formatNewYorkDateTime(lastReplayTime) : "Not started"}
                  </p>
                  {/* Market time and wall-clock time sat side by side with
                      nothing to tell them apart, which read as a data error. */}
                  <p className="mt-1 text-[11px] app-muted">Market time · saved {savedAgo(selectedSession.updatedAt)}</p>
                </div>
              </div>
            </div>
          </section>

          <section
            className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Selected session summary"
          >
            {summaryCards.map(({ label, value, detail, icon: Icon, tone, accent, visual }) => (
              <article key={label} className="panel group relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/25 hover:shadow-card">
                <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 ${accent}`} />
                <div
                  aria-hidden
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-400/5 blur-2xl"
                />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium app-muted">{label}</p>
                      <p className={`mt-1.5 font-mono text-xl font-semibold tracking-tight ${tone}`}>{value}</p>
                    </div>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border app-border bg-[var(--app-panel-2)] transition-colors group-hover:border-brand-400/25">
                      <Icon size={16} className={tone} aria-hidden />
                    </span>
                  </div>
                  {visual}
                  <p className="mt-2 text-xs app-muted">{detail}</p>
                </div>
              </article>
            ))}
          </section>

          <section className="panel mt-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                  Performance
                </p>
                <h2 className="mt-1.5 text-xl font-semibold">Balance and equity</h2>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    netPositive ? "bg-brand-400/10 text-brand-300" : "bg-bear/10 text-bear"
                  }`}
                >
                  {netPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {formatMoney(totalNet)}
                </span>
                {realSelectedSession && <Link
                  href={`/app/results/${realSelectedSession.id}${showDemoData ? "?demo=1" : ""}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200"
                >
                  Open full analytics <ArrowRight size={14} aria-hidden />
                </Link>}
              </div>
            </div>
            <SessionPerformanceChart points={chartPoints} trades={chartTrades} />
          </section>

          <DashboardReviewWorkspace
            insights={insightCards}
            activity={recentTradeActivity.map((trade) => {
              const pnl = new Decimal(trade.pnl);
              return {
                id: trade.id,
                label: `${selectedSymbols.map(formatSymbol).join(", ")} · ${trade.direction} · ${trade.exitReason.replace("-", " ")}`,
                date: formatNewYorkDateTime(trade.exitTime, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                pnl: formatMoney(pnl),
                positive: pnl.gte(0),
              };
            })}
            aiEnabled={aiEnabled}
          />
        </>
      )}

      {sessionRows.length > 0 && (
        <section className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                Saved sessions
              </p>
              <h2 className="mt-2 text-xl font-semibold">Continue or review</h2>
            </div>
            <Link
              href="/app/history"
              className="text-sm font-semibold text-brand-300 hover:text-brand-200"
            >
              View full history
            </Link>
          </div>
          <DashboardSessionsTable sessions={sessionRows} />
        </section>
      )}
    </div>
  );
}
