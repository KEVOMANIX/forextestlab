"use client";

import Link from "next/link";
import { ListChecks, Play } from "lucide-react";
import { ChallengeStrip } from "@/components/app/ChallengeStrip";
import { DashboardSessionsTable, type DashboardSessionRow } from "@/components/app/DashboardSessionsTable";
import { PerformanceOverview } from "@/components/app/PerformanceOverview";
import type { ChallengeCard } from "@/lib/backtest/challenge-record";
import type { PerformancePeriod, PracticePerformance } from "@/lib/backtest/practice-performance";
import { replayDayLabel, replayDayPercent } from "@/lib/backtest/replay-progress";
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
  sessionWinRate?: {
    closedTrades: number;
    winRate: number | null;
  };
}

export interface DashboardPracticeMetrics {
  practiceMinutes: number;
  practiceMinutesByDay: number[];
  /** New York calendar date (YYYY-MM-DD) of this week's Monday. */
  weekStart: string;
  currentWeekdayIndex: number;
  streakDays: number;
  closedTradesThisWeek: number;
}

const DAY_MS = 24 * 60 * 60_000;

function formatMoney(value: Decimal): string {
  const sign = value.isZero() ? "" : value.isNegative() ? "−" : "+";
  const [whole, fraction] = value.abs().toFixed(2).split(".");
  return `${sign}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function sessionFunded(session: DashboardSession): Decimal {
  return new Decimal(session.startingBalance).plus(session.depositedFunds ?? 0);
}

function sessionCurrentTime(session: DashboardSession): number {
  return session.visibleTime != null
    ? Number(session.visibleTime)
    : Math.min(Number(session.endTime), Number(session.startTime) + Math.max(0, session.visibleIndex) * (TIMEFRAME_MS[session.timeframe as keyof typeof TIMEFRAME_MS] ?? 0));
}

/** A session that has never been played: still idle, or never loaded, with no trades. */
function sessionNotStarted(session: DashboardSession): boolean {
  if (session.status === "finished" || session.sessionWinRate?.closedTrades) return false;
  return session.status === "idle" || !session.totalCandles;
}

function sessionProgress(session: DashboardSession): number {
  if (session.status === "finished") return 100;
  if (sessionNotStarted(session)) return 0;
  return replayDayPercent({ startTime: Number(session.startTime), endTime: Number(session.endTime), currentTime: sessionCurrentTime(session) });
}

function sessionProgressLabel(session: DashboardSession): string {
  if (session.status === "finished") return "Completed";
  if (sessionNotStarted(session)) return "Not started";
  return replayDayLabel({ startTime: Number(session.startTime), endTime: Number(session.endTime), currentTime: sessionCurrentTime(session) });
}

function updatedLabel(updatedAt: Date, now: Date): string {
  const dayKey = (value: Date) => formatNewYorkDate(value, { year: "numeric", month: "2-digit", day: "2-digit" });
  if (dayKey(updatedAt) === dayKey(now)) return "Today";
  if (dayKey(updatedAt) === dayKey(new Date(now.getTime() - DAY_MS))) return "Yesterday";
  return formatNewYorkDate(updatedAt, { day: "numeric", month: "short" });
}

export function SignedInDashboard({ sessions, displayName, metrics, activeChallenge = null, performance = null, period = "all" }: {
  sessions: DashboardSession[];
  displayName: string;
  metrics: DashboardPracticeMetrics;
  /** A running prop-firm challenge; challenges are otherwise kept off this page. */
  activeChallenge?: ChallengeCard | null;
  /** Practice results for `period`; null when it holds no practice trades. */
  performance?: PracticePerformance | null;
  period?: PerformancePeriod;
}) {
  const now = new Date();
  const visibleSessions = sessions.filter((session) => !session.archived);
  const latestSession = visibleSessions.find((session) => session.status !== "finished") ?? visibleSessions[0] ?? null;
  const sessionRows: DashboardSessionRow[] = visibleSessions.map((session) => {
    const net = new Decimal(session.balance).minus(sessionFunded(session));
    const pairs = session.symbols.map(formatSymbol);
    return {
      id: session.id,
      name: session.name,
      symbols: pairs.join(", "),
      pairs,
      dateRange: `${formatNewYorkDate(Number(session.startTime), { day: "numeric", month: "short" })} – ${formatNewYorkDate(Number(session.endTime), { day: "numeric", month: "short", year: "numeric" })}`,
      status: session.status === "finished" ? "Completed" : "Active",
      notStarted: sessionNotStarted(session),
      updatedAt: session.updatedAt.getTime(),
      updatedLabel: updatedLabel(session.updatedAt, now),
      pnl: net.toNumber(),
      pnlLabel: formatMoney(net),
      progress: sessionProgress(session),
      progressLabel: sessionProgressLabel(session),
      winRate: session.sessionWinRate?.winRate ?? null,
      closedTrades: session.sessionWinRate?.closedTrades ?? 0,
      archived: false,
    };
  });
  const latestRow = latestSession ? sessionRows.find((row) => row.id === latestSession.id) ?? null : null;
  const continueVerb = latestRow?.status === "Completed" ? "Open" : latestRow?.notStarted ? "Start" : "Continue";

  return (
    <div className="dashboard-workspace mx-auto max-w-[1480px] px-4 py-6 sm:px-6 sm:py-7">
      <header id="dashboard-overview" className="flex flex-col justify-between gap-5 border-b app-border pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Practice overview</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Welcome back, {displayName}</h1>
        </div>
        {latestRow && (
          <Link href={`/app/backtest?session=${encodeURIComponent(latestRow.id)}`} className="inline-flex min-h-11 max-w-full items-center gap-3 self-start rounded-xl bg-brand-500 py-2 pl-2.5 pr-4 text-surface-950 transition-colors hover:bg-brand-400 lg:max-w-md lg:self-auto">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-950 text-brand-400"><Play size={13} fill="currentColor" aria-hidden /></span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold">{continueVerb} {latestRow.name}</span>
              <span className="mt-0.5 block text-xs font-semibold text-surface-950/70">{latestRow.progressLabel}</span>
            </span>
          </Link>
        )}
      </header>

      {activeChallenge && <ChallengeStrip challenge={activeChallenge} />}

      {visibleSessions.length === 0 ? (
        <section className="mt-7 rounded-2xl border border-brand-400/25 bg-brand-400/[0.06] p-6 shadow-card sm:p-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300"><ListChecks size={20} aria-hidden /></span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight">Create your first backtest</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 app-muted">Choose a market and period, replay the price action, then return here whenever you want to continue.</p>
          <Link href="/app/backtest" className="btn-primary mt-6">Start backtesting <Play size={14} fill="currentColor" aria-hidden /></Link>
        </section>
      ) : (
        <>
          <PerformanceOverview performance={performance} period={period} week={metrics} />
          <section className="mt-8" aria-labelledby="recent-sessions">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Sessions</p><h2 id="recent-sessions" className="mt-1.5 text-xl font-semibold">Recently updated</h2></div><Link href="/app/history" className="text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200">View all sessions</Link></div>
            <DashboardSessionsTable sessions={sessionRows} />
          </section>
        </>
      )}
    </div>
  );
}
