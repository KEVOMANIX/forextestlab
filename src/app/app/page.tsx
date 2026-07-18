import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clock3,
  Gauge,
  Play,
  Plus,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { ensureUserProfile } from "@/lib/auth";
import type { SessionState } from "@/lib/backtest/types";
import { prisma } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { getCurrentUser } from "@/lib/supabase/server";
import { SessionCardActions } from "@/components/app/SessionCardActions";
import { formatSymbol } from "@/lib/market-data/symbols";
import { DashboardSessionSwitcher } from "@/components/app/DashboardSessionSwitcher";
import { SessionPerformanceChart } from "@/components/app/SessionPerformanceChart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Backtesting dashboard",
  description:
    "Review private forex backtesting sessions, trading performance, and recent strategy-testing activity.",
  robots: { index: false, follow: false },
};

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
  return `${sign}$${value.abs().toFixed(2)}`;
}

function SignedOutDashboard() {
  const previewCards = [
    {
      icon: ChartNoAxesCombined,
      label: "Session performance",
      text: "Track net P/L, win rate, expectancy, and drawdown across your tests.",
    },
    {
      icon: BookOpenCheck,
      label: "Private history",
      text: "Return to saved sessions, trade decisions, notes, and results.",
    },
    {
      icon: ShieldCheck,
      label: "Your workspace",
      text: "Account sessions are private and visible only to you.",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <section className="relative overflow-hidden rounded-3xl border border-brand-400/20 bg-[linear-gradient(135deg,rgba(34,195,160,0.13),rgba(17,23,37,0.7)_48%,rgba(59,107,255,0.08))] p-7 shadow-card sm:p-10">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl"
        />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
            <BarChart3 size={14} aria-hidden />
            Backtesting dashboard
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
            Turn every backtest into a clearer trading process.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed app-muted sm:text-lg">
            Create an account to save private sessions and see your results,
            trends, trade count, win rate, and recent testing activity in one
            focused workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className="btn-primary shadow-glow">
              Create free account <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/app/backtest" className="btn-secondary">
              <Play size={16} aria-hidden /> Try a temporary demo
            </Link>
          </div>
          <p className="mt-3 text-xs app-muted">
            No payment required. Anonymous demo sessions expire after 24 hours.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
              Dashboard preview
            </p>
            <h2 className="mt-2 text-xl font-semibold">Built around your testing record</h2>
          </div>
          <Link href="/sign-in" className="text-sm font-semibold text-brand-300 hover:underline">
            Already registered? Sign in
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {previewCards.map(({ icon: Icon, label, text }) => (
            <article key={label} className="panel p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-5 font-semibold">{label}</h3>
              <p className="mt-2 text-sm leading-relaxed app-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function AppHome({
  searchParams,
}: {
  searchParams?: {
    performance?: string;
    session?: string;
  };
}) {
  const user = await getCurrentUser();
  if (!user) return <SignedOutDashboard />;

  await ensureUserProfile(user);
  const sessions = await prisma.backtestSession.findMany({
    where: { userId: user.id, anonymous: false },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const legacySelectedId = searchParams?.performance?.startsWith("session:")
    ? searchParams.performance.slice("session:".length)
    : null;
  const selectedSession = sessions.find(
    (session) => session.id === (searchParams?.session ?? legacySelectedId),
  ) ?? sessions[0] ?? null;
  const performanceSessions = selectedSession ? [selectedSession] : [];
  const scopeLabel = selectedSession
    ? sessionName(selectedSession.stateJson, selectedSession.symbol)
    : "No session selected";

  const recentSessions = sessions
    .filter((session) => safeState(session.stateJson)?.config.archived !== true)
    .slice(0, 5);

  const totalNet = performanceSessions.reduce(
    (sum, session) =>
      sum.plus(new Decimal(session.balance).minus(session.startingBalance)),
    new Decimal(0),
  );
  const states = performanceSessions
    .map((session) => safeState(session.stateJson))
    .filter((state): state is SessionState => state !== null);
  const trades = states.flatMap((state) => state.closedTrades);
  const wins = trades.filter((trade) => new Decimal(trade.pnl).gt(0)).length;
  const losses = trades.filter((trade) => new Decimal(trade.pnl).lt(0)).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const maxDrawdown = states.reduce(
    (max, state) => Decimal.max(max, new Decimal(state.maxDrawdown || 0)),
    new Decimal(0),
  );
  const selectedState = states[0] ?? null;
  const bestTrade = trades.reduce<SessionState["closedTrades"][number] | null>(
    (best, trade) => !best || new Decimal(trade.pnl).gt(best.pnl) ? trade : best,
    null,
  );
  const chartPoints = selectedState?.equityCurve.map((point) => ({
    time: point.time,
    balance: Number(point.balance),
    equity: Number(point.equity),
  })) ?? [];
  const displayName =
    typeof user.user_metadata?.display_name === "string" &&
    user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name.trim()
      : user.email?.split("@")[0] ?? "Trader";
  const selectedSymbols = selectedState?.config.symbols?.length
    ? selectedState.config.symbols
    : selectedSession
      ? [selectedSession.symbol]
      : [];
  const sessionProgress = selectedState?.totalCandles
    ? Math.min(100, ((selectedState.visibleIndex + 1) / selectedState.totalCandles) * 100)
    : 0;

  const summaryCards = [
    {
      label: "Session status",
      value: selectedSession?.status === "finished" ? "Completed" : "Active",
      detail: selectedSession ? formatSymbol(selectedSession.symbol) : "No session",
      icon: CalendarDays,
      tone: "text-brand-300",
    },
    {
      label: "Net simulated P/L",
      value: formatMoney(totalNet),
      detail: scopeLabel,
      icon: totalNet.isNegative() ? TrendingDown : TrendingUp,
      tone: totalNet.isNegative() ? "text-bear" : "text-brand-300",
    },
    {
      label: "Total trades",
      value: String(trades.length),
      detail: `${wins} wins · ${losses} losses`,
      icon: Target,
      tone: "text-accent-400",
    },
    {
      label: "Session win rate",
      value: trades.length ? `${winRate.toFixed(1)}%` : "—",
      detail: trades.length ? `${trades.length} closed trades` : "Complete a trade to calculate",
      icon: Gauge,
      tone: "text-amber-300",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
            Strategy workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back, {displayName}
          </h1>
        </div>
        <Link href="/app/backtest" className="btn-primary shrink-0 shadow-glow">
          <Plus size={17} aria-hidden /> New backtest
        </Link>
      </header>

      <section
        className="relative mt-7 overflow-hidden rounded-2xl border border-brand-400/20 bg-[linear-gradient(135deg,rgba(34,195,160,0.10),var(--app-panel)_48%,rgba(59,107,255,0.08))] p-5 shadow-card sm:p-6"
        aria-label="Dashboard session"
      >
        <div aria-hidden className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
              Showing results for
            </p>
            <h2 className="mt-2 truncate text-2xl font-bold tracking-tight text-brand-300 sm:text-3xl">
              &ldquo;{scopeLabel}&rdquo;
            </h2>
              {selectedSession && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs app-muted">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${selectedSession.status === "finished" ? "bg-brand-400/10 text-brand-300" : "bg-amber-400/10 text-amber-300"}`}>{selectedSession.status === "finished" ? "Completed" : "Active"}</span>
                  {selectedSymbols.map((symbol) => <span key={symbol} className="rounded-md border app-border bg-black/10 px-2 py-1 font-mono font-semibold">{formatSymbol(symbol)}</span>)}
                  <span>{new Date(Number(selectedSession.startTime)).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })} – {new Date(Number(selectedSession.endTime)).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              )}
            </div>
            {selectedSession && (
              <DashboardSessionSwitcher
                selectedId={selectedSession.id}
                sessions={sessions.map((session) => {
                  const state = safeState(session.stateJson);
                  const net = new Decimal(session.balance).minus(session.startingBalance);
                  const symbols = state?.config.symbols?.length ? state.config.symbols : [session.symbol];
                  return {
                    id: session.id,
                    name: sessionName(session.stateJson, session.symbol),
                    symbols: symbols.map(formatSymbol).join(", "),
                    status: session.status === "finished" ? "Completed" : "Active",
                    updatedAt: session.updatedAt.toLocaleDateString("en", { day: "numeric", month: "short" }),
                    pnl: formatMoney(net),
                    positive: net.gte(0),
                  };
                })}
              />
            )}
          </div>
          {selectedSession && (
            <div className="grid gap-4 border-t app-border pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <div className="flex items-center justify-between text-xs"><span className="font-semibold app-muted">Replay progress</span><span className="font-mono font-semibold">{sessionProgress.toFixed(0)}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${sessionProgress}%` }} /></div>
              </div>
              <SessionCardActions sessionId={selectedSession.id} status={selectedSession.status} archived={selectedState?.config.archived === true} />
            </div>
          )}
        </div>
      </section>

      {performanceSessions.length === 0 && (
        <section className="panel mt-5 px-6 py-10 text-center">
          <Activity size={28} className="mx-auto text-brand-300" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">Create your first backtest</h2>
          <p className="mx-auto mt-2 max-w-md text-sm app-muted">Your session performance, replay progress, and trading analytics will appear here.</p>
          <Link href="/app/backtest" className="btn-primary mt-5">Start backtesting <ArrowRight size={15} /></Link>
        </section>
      )}

      <section className={`${performanceSessions.length === 0 ? "hidden" : "grid"} mt-8 gap-3 sm:grid-cols-2 xl:grid-cols-4`} aria-label="Selected session summary">
        {summaryCards.map(({ label, value, detail, icon: Icon, tone }) => (
          <article key={label} className="panel relative overflow-hidden p-5">
            <div
              aria-hidden
              className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-400/5 blur-2xl"
            />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium app-muted">{label}</p>
                <p className={`mt-3 font-mono text-2xl font-semibold ${tone}`}>{value}</p>
                <p className="mt-2 text-xs app-muted">{detail}</p>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border app-border bg-[var(--app-panel-2)]">
                <Icon size={18} className={tone} aria-hidden />
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className={`${performanceSessions.length === 0 ? "hidden" : "grid"} mt-4 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]`}>
        <article className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                Session performance
              </p>
              <h2 className="mt-2 text-lg font-semibold">
                Equity curve · {scopeLabel}
              </h2>
            </div>
            <div className={`rounded-full px-3 py-1 font-mono text-sm font-semibold ${
              totalNet.isNegative()
                ? "bg-bear/10 text-bear"
                : "bg-brand-400/10 text-brand-300"
            }`}>
              {formatMoney(totalNet)}
            </div>
          </div>
          <SessionPerformanceChart points={chartPoints} />
        </article>

        <aside className="panel p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            Testing health
          </p>
          <h2 className="mt-2 text-lg font-semibold">At a glance</h2>
          <dl className="mt-5 space-y-4">
            <div className="flex items-center justify-between border-b app-border pb-4">
              <dt className="flex items-center gap-2 text-sm app-muted">
                <CircleDollarSign size={16} aria-hidden /> Best trade
              </dt>
              <dd className="font-mono text-sm font-semibold text-brand-300">
                {bestTrade ? formatMoney(new Decimal(bestTrade.pnl)) : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b app-border pb-4">
              <dt className="flex items-center gap-2 text-sm app-muted">
                <TrendingDown size={16} aria-hidden /> Max drawdown
              </dt>
              <dd className="font-mono text-sm font-semibold text-bear">
                ${maxDrawdown.toFixed(2)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b app-border pb-4">
              <dt className="flex items-center gap-2 text-sm app-muted">
                <BookOpenCheck size={16} aria-hidden /> Replay progress
              </dt>
              <dd className="font-mono text-sm font-semibold">
                {selectedState?.totalCandles
                  ? `${Math.min(100, ((selectedState.visibleIndex + 1) / selectedState.totalCandles) * 100).toFixed(0)}%`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-sm app-muted">
                <Clock3 size={16} aria-hidden /> Last activity
              </dt>
              <dd className="text-right text-xs font-medium">
                {selectedSession
                  ? selectedSession.updatedAt.toLocaleDateString("en", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "No activity in this view"}
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={sessions.length === 0 ? "hidden" : "mt-8"}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
              Recent activity
            </p>
            <h2 className="mt-2 text-xl font-semibold">Your latest sessions</h2>
          </div>
          {sessions.length > 0 && (
            <Link href="/app/history" className="text-sm font-semibold text-brand-300 hover:underline">
              View all sessions
            </Link>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="panel mt-4 flex flex-col items-center px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
              <ChartNoAxesCombined size={25} aria-hidden />
            </span>
            <h3 className="mt-5 text-lg font-semibold">Start building your testing record</h3>
            <Link href="/app/backtest" className="btn-primary mt-6">
              Start first backtest <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="panel mt-4 px-6 py-8 text-center text-sm app-muted">No current sessions. Archived sessions remain available in History.</div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentSessions.map((session) => {
              const net = new Decimal(session.balance).minus(session.startingBalance);
              const positive = net.gte(0);
              const sessionState = safeState(session.stateJson);
              const sessionName =
                sessionState?.config.name?.trim() || `${session.symbol} backtest`;
              const sessionSymbols =
                sessionState?.config.symbols?.length
                  ? sessionState.config.symbols
                  : [session.symbol];
              const tags = sessionState?.config.tags ?? [];
              const archived = sessionState?.config.archived === true;
              return (
                <article
                  key={session.id}
                  className="panel p-5 transition-colors hover:border-brand-400/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold">{sessionName}</h3>
                      <p className="mt-2 flex items-center gap-1.5 text-xs app-muted">
                        <CalendarDays size={13} aria-hidden />
                        {new Date(Number(session.startTime)).toLocaleDateString("en", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                        {" – "}
                        {new Date(Number(session.endTime)).toLocaleDateString("en", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                        session.status === "finished"
                          ? "bg-brand-400/10 text-brand-300"
                          : "bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {sessionSymbols.map((symbol) => (
                      <span
                        key={symbol}
                        className="rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-1 font-mono text-[11px] font-semibold"
                      >
                        {formatSymbol(symbol)}
                      </span>
                    ))}
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-brand-400/10 px-2 py-1 text-[11px] text-brand-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-col gap-4 border-t app-border pt-4">
                    <div>
                      <p className="text-xs app-muted">Net P/L</p>
                      <p className={`mt-1 font-mono text-lg font-semibold ${
                        positive ? "text-brand-300" : "text-bear"
                      }`}>
                        {formatMoney(net)}
                      </p>
                    </div>
                    <SessionCardActions
                      sessionId={session.id}
                      status={session.status}
                      archived={archived}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
