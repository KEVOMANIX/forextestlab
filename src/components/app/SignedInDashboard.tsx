"use client";

import Link from "next/link";
import { Clock3, Flame, ListChecks, Play, Target } from "lucide-react";
import { DashboardSessionsTable, type DashboardSessionRow } from "@/components/app/DashboardSessionsTable";
import { replayDayPercent } from "@/lib/backtest/replay-progress";
import { formatNewYorkDate } from "@/lib/date-time";
import { Decimal } from "@/lib/decimal";
import { formatSymbol } from "@/lib/market-data/symbols";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

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
  visibleTime: bigint | null;
  totalCandles: number;
  startingBalance: string;
  depositedFunds: string;
  balance: string;
  maxDrawdown: string;
  maxDrawdownPercent: string;
  updatedAt: Date;
  archived: boolean;
}

export interface DashboardPracticeMetrics {
  replayMinutes: number;
  streakDays: number;
  sessionsThisWeek: number;
  winRate: number | null;
  winRateSampleSize: number;
}

function formatMoney(value: Decimal): string {
  const sign = value.isPositive() ? "+" : value.isNegative() ? "−" : "";
  const [whole, fraction] = value.abs().toFixed(2).split(".");
  return `${sign}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function sessionFunded(session: DashboardSession): Decimal {
  return new Decimal(session.startingBalance).plus(session.depositedFunds ?? 0);
}

function sessionProgress(session: DashboardSession): number {
  if (session.status === "finished") return 100;
  if (!session.totalCandles) return 0;
  const currentTime = session.visibleTime != null
    ? Number(session.visibleTime)
    : Math.min(Number(session.endTime), Number(session.startTime) + Math.max(0, session.visibleIndex) * (TIMEFRAME_MS[session.timeframe as keyof typeof TIMEFRAME_MS] ?? 0));
  return replayDayPercent({ startTime: Number(session.startTime), endTime: Number(session.endTime), currentTime });
}

function formatReplayTime(minutes: number): string {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function SignedInDashboard({ sessions, displayName, metrics }: {
  sessions: DashboardSession[];
  displayName: string;
  metrics: DashboardPracticeMetrics;
}) {
  const visibleSessions = sessions.filter((session) => !session.archived);
  const latestSession = visibleSessions.find((session) => session.status !== "finished") ?? visibleSessions[0] ?? null;
  const sessionRows: DashboardSessionRow[] = visibleSessions.map((session) => {
    const net = new Decimal(session.balance).minus(sessionFunded(session));
    return {
      id: session.id,
      name: session.name,
      symbols: session.symbols.map(formatSymbol).join(", "),
      dateRange: `${formatNewYorkDate(Number(session.startTime), { day: "numeric", month: "short" })} – ${formatNewYorkDate(Number(session.endTime), { day: "numeric", month: "short", year: "numeric" })}`,
      status: session.status === "finished" ? "Completed" : "Active",
      updatedAt: session.updatedAt.getTime(),
      updatedLabel: `Updated ${formatNewYorkDate(session.updatedAt, { day: "numeric", month: "short" })}`,
      pnl: net.toNumber(),
      pnlLabel: formatMoney(net),
      progress: sessionProgress(session),
      archived: false,
    };
  });

  const cards = [
    { label: "Replay time", value: formatReplayTime(metrics.replayMinutes), detail: metrics.replayMinutes ? "This week" : "Starts with your next replay", icon: Clock3, tone: "text-brand-300" },
    { label: "Practice streak", value: metrics.streakDays ? `${metrics.streakDays} day${metrics.streakDays === 1 ? "" : "s"}` : "—", detail: metrics.streakDays ? "Consecutive replay days" : "Build a daily replay habit", icon: Flame, tone: "text-accent-400" },
    { label: "Sessions touched", value: String(metrics.sessionsThisWeek), detail: "Updated this week", icon: ListChecks, tone: "text-brand-300" },
    { label: "Average win rate", value: metrics.winRate === null ? "—" : `${metrics.winRate.toFixed(0)}%`, detail: metrics.winRateSampleSize ? `Last ${metrics.winRateSampleSize} closed trades` : "Close trades to build a sample", icon: Target, tone: "text-accent-400" },
  ];
  return (
    <div className="dashboard-workspace mx-auto max-w-[1480px] px-4 py-6 sm:px-6 sm:py-7">
      <header id="dashboard-overview" className="flex flex-col justify-between gap-5 border-b app-border pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Practice overview</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Welcome back, {displayName}</h1>
          <p className="mt-1.5 text-sm app-muted">Pick up your testing routine and continue when you are ready.</p>
        </div>
        {latestSession && <Link href={`/app/backtest?session=${encodeURIComponent(latestSession.id)}`} className="inline-flex h-9 items-center gap-2 self-start rounded-lg bg-brand-500 px-3.5 text-xs font-bold text-surface-950 transition-colors hover:bg-brand-400 lg:self-auto"><Play size={13} fill="currentColor" aria-hidden /> Continue latest session</Link>}
      </header>

      {visibleSessions.length === 0 ? (
        <section className="mt-7 rounded-2xl border border-brand-400/25 bg-brand-400/[0.06] p-6 shadow-card sm:p-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300"><ListChecks size={20} aria-hidden /></span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight">Create your first backtest</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 app-muted">Choose a market and period, replay the price action, then return here whenever you want to continue.</p>
          <Link href="/app/backtest" className="btn-primary mt-6">Start backtesting <Play size={14} fill="currentColor" aria-hidden /></Link>
        </section>
      ) : (
        <>
          <section className="mt-7" aria-labelledby="practice-this-week">
            <div className="flex items-baseline justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Your practice</p><h2 id="practice-this-week" className="mt-1.5 text-xl font-semibold">This week</h2></div><p className="hidden text-xs app-muted sm:block">Your progress is measured across saved sessions.</p></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(({ label, value, detail, icon: Icon, tone }) => <article key={label} className="panel p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><p className="text-xs font-semibold app-muted">{label}</p><span className={`grid h-8 w-8 place-items-center rounded-lg bg-brand-400/[0.14] ${tone}`}><Icon size={16} aria-hidden /></span></div><p className={`mt-4 font-mono text-2xl font-semibold tracking-tight ${tone}`}>{value}</p><p className="mt-1.5 text-xs app-muted">{detail}</p></article>)}
            </div>
          </section>
          <section className="mt-8" aria-labelledby="recent-sessions">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Sessions</p><h2 id="recent-sessions" className="mt-1.5 text-xl font-semibold">Recently updated</h2></div><Link href="/app/history" className="text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200">View all sessions</Link></div>
            <DashboardSessionsTable sessions={sessionRows} />
          </section>
        </>
      )}
    </div>
  );
}
