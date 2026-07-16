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

function formatMoney(value: Decimal): string {
  const sign = value.isPositive() ? "+" : value.isNegative() ? "−" : "";
  return `${sign}$${value.abs().toFixed(2)}`;
}

function PerformanceTrend({ values }: { values: number[] }) {
  const points = values.length > 1 ? values : [0, values[0] ?? 0];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 700;
  const height = 210;
  const pad = 12;
  const step = (width - pad * 2) / (points.length - 1);
  const y = (value: number) =>
    pad + (1 - (value - min) / range) * (height - pad * 2);
  const line = points
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${(pad + index * step).toFixed(1)},${y(value).toFixed(1)}`,
    )
    .join(" ");
  const positive = points[points.length - 1]! >= points[0]!;

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]/60">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,var(--app-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--app-border)_1px,transparent_1px)] [background-size:48px_48px]"
      />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="relative h-52 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Cumulative simulated profit and loss by session"
      >
        <defs>
          <linearGradient id="dashboard-performance" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={positive ? "#22c3a0" : "#f4646c"}
              stopOpacity="0.28"
            />
            <stop
              offset="100%"
              stopColor={positive ? "#22c3a0" : "#f4646c"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <path
          d={`${line} L${width - pad},${height - pad} L${pad},${height - pad} Z`}
          fill="url(#dashboard-performance)"
        />
        <path
          d={line}
          fill="none"
          stroke={positive ? "#22c3a0" : "#f4646c"}
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
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
        <div className="flex items-end justify-between gap-4">
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

export default async function AppHome() {
  const user = await getCurrentUser();
  if (!user) return <SignedOutDashboard />;

  await ensureUserProfile(user);
  const sessions = await prisma.backtestSession.findMany({
    where: { userId: user.id, anonymous: false },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { trades: true } } },
  });

  const chronological = [...sessions].reverse();
  const totalNet = sessions.reduce(
    (sum, session) =>
      sum.plus(new Decimal(session.balance).minus(session.startingBalance)),
    new Decimal(0),
  );
  const states = sessions
    .map((session) => safeState(session.stateJson))
    .filter((state): state is SessionState => state !== null);
  const trades = states.flatMap((state) => state.closedTrades);
  const wins = trades.filter((trade) => new Decimal(trade.pnl).gt(0)).length;
  const losses = trades.filter((trade) => new Decimal(trade.pnl).lt(0)).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const completed = sessions.filter((session) => session.status === "finished").length;
  const maxDrawdown = states.reduce(
    (max, state) => Decimal.max(max, new Decimal(state.maxDrawdown || 0)),
    new Decimal(0),
  );
  const bestSession = sessions.reduce<(typeof sessions)[number] | null>(
    (best, session) => {
      if (!best) return session;
      const currentNet = new Decimal(session.balance).minus(session.startingBalance);
      const bestNet = new Decimal(best.balance).minus(best.startingBalance);
      return currentNet.gt(bestNet) ? session : best;
    },
    null,
  );
  let cumulative = new Decimal(0);
  const trend = [0, ...chronological.map((session) => {
    cumulative = cumulative.plus(
      new Decimal(session.balance).minus(session.startingBalance),
    );
    return cumulative.toNumber();
  })];
  const displayName =
    typeof user.user_metadata?.display_name === "string" &&
    user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name.trim()
      : user.email?.split("@")[0] ?? "Trader";

  const summaryCards = [
    {
      label: "Total sessions",
      value: String(sessions.length),
      detail: `${completed} completed`,
      icon: CalendarDays,
      tone: "text-brand-300",
    },
    {
      label: "Net simulated P/L",
      value: formatMoney(totalNet),
      detail: sessions.length ? "Across saved sessions" : "No saved results yet",
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
      label: "Overall win rate",
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
          <p className="mt-2 max-w-2xl text-sm leading-relaxed app-muted sm:text-base">
            Review your testing record, spot performance patterns, or begin a
            fresh market-replay session.
          </p>
        </div>
        <Link href="/app/backtest" className="btn-primary shrink-0 shadow-glow">
          <Plus size={17} aria-hidden /> New backtest
        </Link>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Account summary">
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

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <article className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                Performance trend
              </p>
              <h2 className="mt-2 text-lg font-semibold">Cumulative session P/L</h2>
            </div>
            <div className={`rounded-full px-3 py-1 font-mono text-sm font-semibold ${
              totalNet.isNegative()
                ? "bg-bear/10 text-bear"
                : "bg-brand-400/10 text-brand-300"
            }`}>
              {formatMoney(totalNet)}
            </div>
          </div>
          {sessions.length ? (
            <PerformanceTrend values={trend} />
          ) : (
            <div className="mt-5 grid min-h-52 place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/40 p-6 text-center">
              <div>
                <Activity size={26} className="mx-auto text-brand-300" aria-hidden />
                <p className="mt-3 font-medium">Your performance trend will appear here</p>
                <p className="mt-1 text-sm app-muted">
                  Complete your first saved backtest to start building a record.
                </p>
              </div>
            </div>
          )}
        </article>

        <aside className="panel p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            Testing health
          </p>
          <h2 className="mt-2 text-lg font-semibold">At a glance</h2>
          <dl className="mt-5 space-y-4">
            <div className="flex items-center justify-between border-b app-border pb-4">
              <dt className="flex items-center gap-2 text-sm app-muted">
                <CircleDollarSign size={16} aria-hidden /> Best session
              </dt>
              <dd className="font-mono text-sm font-semibold text-brand-300">
                {bestSession
                  ? formatMoney(
                      new Decimal(bestSession.balance).minus(bestSession.startingBalance),
                    )
                  : "—"}
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
                <BookOpenCheck size={16} aria-hidden /> Completion
              </dt>
              <dd className="font-mono text-sm font-semibold">
                {sessions.length ? `${completed}/${sessions.length}` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-sm app-muted">
                <Clock3 size={16} aria-hidden /> Last activity
              </dt>
              <dd className="text-right text-xs font-medium">
                {sessions[0]
                  ? sessions[0].updatedAt.toLocaleDateString("en", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "No sessions"}
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="mt-8">
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
            <p className="mt-2 max-w-md text-sm leading-relaxed app-muted">
              Your saved sessions, results, notes, and performance patterns will
              collect here as you test.
            </p>
            <Link href="/app/backtest" className="btn-primary mt-6">
              Start first backtest <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.slice(0, 6).map((session) => {
              const net = new Decimal(session.balance).minus(session.startingBalance);
              const positive = net.gte(0);
              const resumable = session.status !== "finished";
              return (
                <Link
                  key={session.id}
                  href={
                    resumable
                      ? `/app/backtest?session=${encodeURIComponent(session.id)}`
                      : `/app/results/${session.id}`
                  }
                  className="panel group p-5 transition-colors hover:border-brand-400/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-semibold">
                          {session.symbol}
                        </span>
                        <span className="rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-0.5 font-mono text-[11px] app-muted">
                          {session.timeframe}
                        </span>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs app-muted">
                        <CalendarDays size={13} aria-hidden />
                        {session.createdAt.toLocaleDateString("en", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
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
                  <div className="mt-6 flex items-end justify-between border-t app-border pt-4">
                    <div>
                      <p className="text-xs app-muted">Net P/L</p>
                      <p className={`mt-1 font-mono text-lg font-semibold ${
                        positive ? "text-brand-300" : "text-bear"
                      }`}>
                        {formatMoney(net)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs app-muted">
                        {resumable ? "Continue" : "Trades"}
                      </p>
                      <p className="mt-1 font-mono font-semibold">
                        {resumable
                          ? `${session.visibleIndex + 1}/${session.totalCandles}`
                          : session._count.trades}
                      </p>
                    </div>
                    <ArrowRight
                      size={17}
                      className="mb-1 text-brand-300 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
