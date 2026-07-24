import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Clock3,
  Gauge,
  Lightbulb,
  ListChecks,
  Play,
  Plus,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { BacktestSession } from "@prisma/client";

import { DashboardSessionSwitcher } from "@/components/app/DashboardSessionSwitcher";
import {
  DashboardSessionsTable,
  type DashboardSessionRow,
} from "@/components/app/DashboardSessionsTable";
import { SessionCardActions } from "@/components/app/SessionCardActions";
import { SessionPerformanceChart } from "@/components/app/SessionPerformanceChart";
import { computeStatistics } from "@/lib/backtest/statistics";
import type { ClosedTrade, SessionState } from "@/lib/backtest/types";
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

function safeState(value: string): SessionState | null {
  try {
    return JSON.parse(value) as SessionState;
  } catch {
    return null;
  }
}

function sessionName(stateJson: string, fallbackSymbol: string): string {
  return safeState(stateJson)?.config.name?.trim() || `${fallbackSymbol} backtest`;
}

function formatMoney(value: Decimal): string {
  const sign = value.isPositive() ? "+" : value.isNegative() ? "−" : "";
  const [whole, frac] = value.abs().toFixed(2).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}.${frac}`;
}

function sessionProgress(state: SessionState | null): number {
  if (!state?.totalCandles) return state?.status === "finished" ? 100 : 0;
  return Math.min(
    100,
    Math.max(0, ((state.visibleIndex + 1) / state.totalCandles) * 100),
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
  displayName,
  selectedId,
}: {
  sessions: BacktestSession[];
  displayName: string;
  selectedId?: string | null;
}) {
  const selectedSession =
    sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  const selectedState = selectedSession ? safeState(selectedSession.stateJson) : null;
  const scopeLabel = selectedSession
    ? sessionName(selectedSession.stateJson, selectedSession.symbol)
    : "No session selected";
  const selectedSymbols = selectedState?.config.symbols?.length
    ? selectedState.config.symbols
    : selectedSession
      ? [selectedSession.symbol]
      : [];
  const progress = sessionProgress(selectedState);
  const trades = selectedState?.closedTrades ?? [];
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
    selectedSession && selectedState
      ? computeStatistics({
          startingBalance: selectedSession.startingBalance,
          endingBalance: selectedSession.balance,
          trades,
          equityCurve: selectedState.equityCurve,
        })
      : null;
  const chartPoints =
    selectedState?.equityCurve.map((point) => ({
      time: point.time,
      balance: Number(point.balance),
      equity: Number(point.equity),
    })) ?? [];
  const chartTrades = trades.map((trade) => ({
    time: trade.exitTime,
    pnl: Number(trade.pnl),
  }));

  const lastReplayTime =
    selectedSession && selectedState
      ? Math.min(
          Number(selectedSession.endTime),
          Number(selectedSession.startTime) +
            Math.max(0, selectedState.visibleIndex) *
              TIMEFRAME_MS[selectedState.config.timeframe],
        )
      : null;

  const dayLeaders = aggregateTradePnl(
    trades,
    (trade) => getNewYorkDateParts(trade.exitTime).weekday,
  );
  const marketSessionLeaders = aggregateTradePnl(trades, (trade) =>
    getTradingSession(trade.entryTime),
  );

  const insightCards = trades.length
    ? [
        {
          icon: Trophy,
          title: `${WEEKDAYS[Number(dayLeaders[0]?.key ?? 0)]} is your strongest day`,
          detail: `${formatMoney(dayLeaders[0]?.pnl ?? new Decimal(0))} across ${dayLeaders[0]?.count ?? 0} closed trade${dayLeaders[0]?.count === 1 ? "" : "s"}.`,
        },
        {
          icon: Clock3,
          title: `${marketSessionLeaders[0]?.key ?? "New York"} leads your session results`,
          detail: `${formatMoney(marketSessionLeaders[0]?.pnl ?? new Decimal(0))} from ${marketSessionLeaders[0]?.count ?? 0} trade${marketSessionLeaders[0]?.count === 1 ? "" : "s"} entered in this market window.`,
        },
        {
          icon: Gauge,
          title:
            stats?.expectancy === "Not available"
              ? "Build a larger trade sample"
              : `${stats?.expectancy} expectancy per trade`,
          detail:
            stats?.profitFactor === "Not available"
              ? "Close both winning and losing trades to establish a profit factor."
              : `Profit factor ${stats?.profitFactor} · average risk/reward ${stats?.averageRiskReward}.`,
        },
      ]
    : [
        {
          icon: Play,
          title: "Resume replay and place your first trade",
          detail: "Insights become specific to this session as you close positions.",
        },
        {
          icon: Target,
          title: `${progress.toFixed(0)}% of the replay completed`,
          detail: "Continue from the last saved candle whenever you are ready.",
        },
        {
          icon: Lightbulb,
          title: "Use notes to capture the reason behind each decision",
          detail: "A consistent record makes the analytics more useful later.",
        },
      ];

  const recentTradeActivity = [...trades]
    .sort((left, right) => right.exitTime - left.exitTime)
    .slice(0, 4);

  const sessionOptions = sessions.map((session) => {
    const state = safeState(session.stateJson);
    const net = new Decimal(session.balance).minus(session.startingBalance);
    const symbols = state?.config.symbols?.length
      ? state.config.symbols
      : [session.symbol];
    return {
      id: session.id,
      name: sessionName(session.stateJson, session.symbol),
      symbols: symbols.map(formatSymbol).join(", "),
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
      const state = safeState(session.stateJson);
      if (state?.config.archived === true) return null;
      const net = new Decimal(session.balance).minus(session.startingBalance);
      const symbols = state?.config.symbols?.length
        ? state.config.symbols
        : [session.symbol];
      return {
        id: session.id,
        name: sessionName(session.stateJson, session.symbol),
        symbols: symbols.map(formatSymbol).join(", "),
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
        progress: sessionProgress(state),
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
    <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
            Strategy workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back, {displayName}
          </h1>
          <p className="mt-2 text-sm app-muted">
            Continue your latest replay or review the decisions behind your results.
          </p>
        </div>
        <Link href="/app/backtest" className="btn-primary shrink-0 shadow-glow">
          <Plus size={17} aria-hidden /> New backtest
        </Link>
      </header>

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
            className="relative mt-7 overflow-hidden rounded-2xl border border-brand-400/20 bg-[linear-gradient(135deg,rgba(34,195,160,0.11),var(--app-panel)_50%,rgba(59,107,255,0.08))] p-5 shadow-card sm:p-6"
            aria-label="Selected dashboard session"
          >
            <div
              aria-hidden
              className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-400/10 blur-3xl"
            />
            <div className="relative">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">
                    {selectedSession.status === "finished"
                      ? "Review completed session"
                      : "Continue where you stopped"}
                  </p>
                  <h2 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">
                    {scopeLabel}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs app-muted">
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        selectedSession.status === "finished"
                          ? "bg-brand-400/10 text-brand-300"
                          : "bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      {selectedSession.status === "finished" ? "Completed" : "Active"}
                    </span>
                    {selectedSymbols.map((symbol) => (
                      <span
                        key={symbol}
                        className="rounded-md border app-border bg-black/10 px-2 py-1 font-mono font-semibold"
                      >
                        {formatSymbol(symbol)}
                      </span>
                    ))}
                    <span>
                      {formatNewYorkDate(Number(selectedSession.startTime))} –{" "}
                      {formatNewYorkDate(Number(selectedSession.endTime))}
                    </span>
                  </div>
                </div>
                <DashboardSessionSwitcher
                  selectedId={selectedSession.id}
                  sessions={sessionOptions}
                />
              </div>

              <div className="mt-6 grid gap-3 border-t app-border pt-5 sm:grid-cols-3">
                <div className="rounded-xl bg-black/[0.08] p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold app-muted">Replay progress</span>
                    <span className="font-mono font-semibold">{progress.toFixed(0)}%</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl bg-black/[0.08] p-4">
                  <p className="text-xs font-semibold app-muted">Last replay candle</p>
                  <p className="mt-2 text-sm font-semibold">
                    {lastReplayTime ? formatNewYorkDateTime(lastReplayTime) : "Not started"}
                  </p>
                </div>
                <div className="rounded-xl bg-black/[0.08] p-4">
                  <p className="text-xs font-semibold app-muted">Last activity</p>
                  <p className="mt-2 text-sm font-semibold">
                    {formatNewYorkDateTime(selectedSession.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t app-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs app-muted">
                  Your replay position and trades are saved automatically.
                </p>
                <SessionCardActions
                  sessionId={selectedSession.id}
                  sessionName={scopeLabel}
                  status={selectedSession.status}
                  archived={selectedState?.config.archived === true}
                  compact
                />
              </div>
            </div>
          </section>

          <section
            className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Selected session summary"
          >
            {summaryCards.map(({ label, value, detail, icon: Icon, tone, accent, visual }) => (
              <article key={label} className="panel relative overflow-hidden p-5">
                <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 ${accent}`} />
                <div
                  aria-hidden
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-400/5 blur-2xl"
                />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium app-muted">{label}</p>
                      <p className={`mt-3 font-mono text-2xl font-semibold ${tone}`}>{value}</p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-panel-2)]">
                      <Icon size={18} className={tone} aria-hidden />
                    </span>
                  </div>
                  {visual}
                  <p className="mt-2 text-xs app-muted">{detail}</p>
                </div>
              </article>
            ))}
          </section>

          <section className="panel mt-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                  Performance
                </p>
                <h2 className="mt-2 text-xl font-semibold">Balance and equity</h2>
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
                <Link
                  href={`/app/results/${selectedSession.id}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200"
                >
                  Open full analytics <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            </div>
            <SessionPerformanceChart points={chartPoints} trades={chartTrades} />
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <article className="panel p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                    Performance insights
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    Patterns worth reviewing
                  </h2>
                </div>
                <Sparkles size={20} className="text-brand-300" aria-hidden />
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {insightCards.map(({ icon: Icon, title, detail }) => (
                  <div
                    key={title}
                    className="rounded-xl border app-border bg-[var(--app-panel-2)]/65 p-4 transition-colors hover:border-brand-400/25"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-400/10 text-brand-300">
                      <Icon size={16} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold leading-5">{title}</h3>
                    <p className="mt-2 text-xs leading-5 app-muted">{detail}</p>
                  </div>
                ))}
              </div>
            </article>

            <aside className="panel p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                Recent activity
              </p>
              <h2 className="mt-2 text-xl font-semibold">Latest decisions</h2>
              <div className="mt-5">
                {recentTradeActivity.length ? (
                  <ol className="space-y-1">
                    {recentTradeActivity.map((trade) => {
                      const pnl = new Decimal(trade.pnl);
                      return (
                        <li
                          key={trade.id}
                          className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-white/[0.025]"
                        >
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                              pnl.gte(0)
                                ? "bg-brand-400/10 text-brand-300"
                                : "bg-bear/10 text-bear"
                            }`}
                          >
                            {pnl.gte(0) ? (
                              <TrendingUp size={14} aria-hidden />
                            ) : (
                              <TrendingDown size={14} aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold capitalize">
                              {trade.direction} position · {trade.exitReason.replace("-", " ")}
                            </span>
                            <span className="mt-1 block text-[11px] app-muted">
                              {formatNewYorkDateTime(trade.exitTime, {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                          <span
                            className={`font-mono text-xs font-semibold ${
                              pnl.gte(0) ? "text-brand-300" : "text-bear"
                            }`}
                          >
                            {formatMoney(pnl)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="rounded-xl bg-[var(--app-panel-2)]/60 px-4 py-8 text-center">
                    <Activity size={20} className="mx-auto text-brand-300" aria-hidden />
                    <p className="mt-3 text-sm font-semibold">No closed trades yet</p>
                    <p className="mt-1 text-xs app-muted">
                      Your latest decisions will appear here.
                    </p>
                  </div>
                )}
              </div>
            </aside>
          </section>
        </>
      )}

      {sessionRows.length > 0 && (
        <section className="mt-8">
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
