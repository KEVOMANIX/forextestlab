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
  sessionWinRate?: {
    closedTrades: number;
    winRate: number | null;
  };
}

export interface DashboardPracticeMetrics {
  replayMinutes: number;
  replayMinutesByDay: number[];
  currentWeekdayIndex: number;
  streakDays: number;
  closedTradesThisWeek: number;
  winRate: number | null;
  winRateSampleSize: number;
  winningTrades: number;
  losingTrades: number;
  recentOutcomes: Array<"win" | "loss" | "flat">;
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
  if (!minutes) return "0m";
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
      winRate: session.sessionWinRate?.winRate ?? null,
      closedTrades: session.sessionWinRate?.closedTrades ?? 0,
      archived: false,
    };
  });

  const replayDays = metrics.replayMinutesByDay.length === 7 ? metrics.replayMinutesByDay : [0, 0, 0, 0, 0, 0, 0];
  const maxReplayMinutes = Math.max(1, ...replayDays);
  const recentOutcomeSlots: Array<"win" | "loss" | "flat" | null> = [
    ...Array.from({ length: Math.max(0, 30 - metrics.recentOutcomes.length) }, () => null),
    ...metrics.recentOutcomes.slice(-30),
  ];
  return (
    <div className="dashboard-workspace mx-auto max-w-[1480px] px-4 py-6 sm:px-6 sm:py-7">
      <header id="dashboard-overview" className="flex flex-col justify-between gap-5 border-b app-border pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Practice overview</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Welcome back, {displayName}</h1>
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
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Practice activity</p><h2 id="practice-this-week" className="mt-1.5 text-xl font-semibold">This week</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_.82fr_.82fr] xl:grid-rows-[8.75rem_8.5rem]">
              <article className="relative overflow-hidden rounded-2xl border border-brand-400/25 bg-[radial-gradient(circle_at_82%_12%,rgba(69,214,168,.16),transparent_35%),var(--app-panel)] p-5 shadow-card sm:col-span-2 xl:col-span-1 xl:row-span-2">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold app-muted">Replay time</p><p className="mt-4 font-mono text-4xl font-semibold leading-none tracking-tight text-[var(--app-text)]">{formatReplayTime(metrics.replayMinutes)}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300"><Clock3 size={18} aria-hidden /></span></div>
                <div className="mt-7 flex h-16 items-end gap-2" role="img" aria-label={`Replay activity from Monday to Sunday: ${replayDays.join(", ")} minutes`}>
                  {replayDays.map((minutes, index) => <span key={index} className={`min-h-2 flex-1 rounded-t-md ${index === metrics.currentWeekdayIndex ? "bg-gradient-to-t from-brand-500 to-brand-200" : "bg-brand-400/20"}`} style={{ height: `${Math.max(12, (minutes / maxReplayMinutes) * 100)}%` }} title={`${minutes} minutes`} />)}
                </div>
                <div className="mt-2 flex justify-between font-mono text-[9px] font-semibold uppercase app-muted"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
              </article>

              <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold app-muted">Current streak</p><p className="mt-5 font-mono text-[1.65rem] font-semibold leading-none tracking-tight text-[var(--app-text)]">{metrics.streakDays} day{metrics.streakDays === 1 ? "" : "s"}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">Consecutive</p></div><Flame size={19} className="text-exit" aria-hidden /></div></article>

              <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold app-muted">Closed trades</p><p className="mt-5 font-mono text-[1.65rem] font-semibold leading-none tracking-tight text-[var(--app-text)]">{metrics.closedTradesThisWeek}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">This week</p></div><span className="grid h-9 w-9 place-items-center rounded-lg border app-border bg-brand-400/10 text-brand-300"><ListChecks size={17} aria-hidden /></span></div></article>

              <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card sm:col-span-2 xl:col-span-2">
                <div className="flex h-full flex-col justify-center">
                  <div className="flex items-start justify-between gap-5">
                    <div><p className="text-xs font-semibold app-muted">Recent results</p><div className="mt-2 flex items-baseline gap-2"><p className="font-mono text-2xl font-semibold leading-none text-[var(--app-text)]">{metrics.winRate === null ? "—" : `${metrics.winRate.toFixed(0)}%`}</p><span className="text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">win rate</span></div></div>
                    <div className="flex items-center gap-2.5 font-mono"><span className="text-lg font-semibold text-profit">{metrics.winningTrades}</span><span className="text-[9px] font-semibold uppercase tracking-[0.1em] app-muted">W</span><span className="h-5 w-px bg-[var(--app-border)]" /><span className="text-lg font-semibold text-loss">{metrics.losingTrades}</span><span className="text-[9px] font-semibold uppercase tracking-[0.1em] app-muted">L</span><Target size={17} className="ml-1 text-brand-300" aria-hidden /></div>
                  </div>
                  <div className="mt-4 grid h-8 shrink-0 items-end gap-1" style={{ gridTemplateColumns: "repeat(30, minmax(0, 1fr))" }} role="img" aria-label={`Last ${metrics.winRateSampleSize} closed trades: ${metrics.winningTrades} wins and ${metrics.losingTrades} losses`}>
                    {recentOutcomeSlots.map((outcome, index) => <span key={index} className="block min-w-0 rounded-sm" style={{ height: outcome === "win" ? "100%" : outcome === "loss" ? "58%" : outcome === "flat" ? "35%" : "22%", backgroundColor: outcome === "win" ? "rgb(var(--trade-profit-rgb))" : outcome === "loss" ? "rgb(var(--trade-loss-rgb))" : outcome === "flat" ? "var(--app-muted)" : "var(--app-panel-2)" }} title={outcome ? `${outcome[0]!.toUpperCase()}${outcome.slice(1)}` : "No trade"} />)}
                  </div>
                  <div className="mt-2 flex shrink-0 justify-between text-[9px] font-semibold uppercase tracking-[0.11em] app-muted"><span>Oldest</span><span>{metrics.winRateSampleSize ? `Last ${metrics.winRateSampleSize} trades` : "No closed trades"}</span><span>Latest</span></div>
                </div>
              </article>
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
