"use client";

import Link from "next/link";
import { Clock3, Flame, ListChecks, Play } from "lucide-react";
import { DashboardSessionsTable, type DashboardSessionRow } from "@/components/app/DashboardSessionsTable";
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
  winRate: number | null;
  winRateSampleSize: number;
  winningTrades: number;
  losingTrades: number;
  /** P/L of the most recent closed trades, oldest first. */
  recentTradePnls: number[];
  recentNetPnl: string;
  /** Gross profit over gross loss; null when there are no losing trades. */
  recentProfitFactor: number | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 24 * 60 * 60_000;

function formatMoney(value: Decimal): string {
  const sign = value.isZero() ? "" : value.isNegative() ? "−" : "+";
  const [whole, fraction] = value.abs().toFixed(2).split(".");
  return `${sign}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function pnlTone(value: number): string {
  return value > 0 ? "text-profit" : value < 0 ? "text-loss" : "app-muted";
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

function formatPracticeTime(minutes: number): string {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** "19–25 Oct", or "28 Sep – 4 Oct" when the week spans two months. */
function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const month = (value: Date) => new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(value);
  return month(start) === month(end)
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${month(end)}`
    : `${start.getUTCDate()} ${month(start)} – ${end.getUTCDate()} ${month(end)}`;
}

export function SignedInDashboard({ sessions, displayName, metrics }: {
  sessions: DashboardSession[];
  displayName: string;
  metrics: DashboardPracticeMetrics;
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

  const practiceDays = metrics.practiceMinutesByDay.length === 7 ? metrics.practiceMinutesByDay : [0, 0, 0, 0, 0, 0, 0];
  const maxPracticeMinutes = Math.max(1, ...practiceDays);
  const weekRange = formatWeekRange(metrics.weekStart);

  const recentPnls = metrics.recentTradePnls.slice(-30);
  const maxAbsPnl = Math.max(0, ...recentPnls.map((pnl) => Math.abs(pnl)));
  const recentSlots: Array<number | null> = [
    ...Array.from({ length: Math.max(0, 30 - recentPnls.length) }, () => null),
    ...recentPnls,
  ];
  const recentNet = new Decimal(metrics.recentNetPnl || 0);
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
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Practice activity</p><h2 id="practice-this-week" className="mt-1.5 text-xl font-semibold">This week{weekRange && <span className="font-medium app-muted"> · {weekRange}</span>}</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_.82fr_.82fr] xl:grid-rows-[8.75rem_11.25rem]">
              <article className="relative flex flex-col overflow-hidden rounded-2xl border border-brand-400/25 bg-[radial-gradient(circle_at_82%_12%,rgba(69,214,168,.16),transparent_35%),var(--app-panel)] p-5 shadow-card sm:col-span-2 xl:col-span-1 xl:row-span-2">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold app-muted">Practice time</p><p className="mt-4 font-mono text-4xl font-semibold leading-none tracking-tight text-[var(--app-text)]">{formatPracticeTime(metrics.practiceMinutes)}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300"><Clock3 size={18} aria-hidden /></span></div>
                <div className="mt-5 flex min-h-[8rem] flex-1 gap-2" role="img" aria-label={`Practice minutes from Monday to Sunday: ${practiceDays.map((minutes, index) => index > metrics.currentWeekdayIndex ? "upcoming" : minutes).join(", ")}`}>
                  {practiceDays.map((minutes, index) => {
                    const upcoming = index > metrics.currentWeekdayIndex;
                    const today = index === metrics.currentWeekdayIndex;
                    return (
                      <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                        <span className={`h-4 font-mono text-[11px] ${minutes ? "font-semibold text-[var(--app-text)]" : "app-muted"}`}>{upcoming ? "" : formatPracticeTime(minutes)}</span>
                        <div className="relative w-full flex-1" title={upcoming ? "Upcoming" : `${minutes} minutes`}>
                          <span
                            className={`absolute inset-x-0 bottom-0 rounded-t-md ${minutes ? "bg-brand-500" : upcoming ? "bg-[var(--app-panel-2)]" : "bg-[var(--app-border)]"}`}
                            style={{ height: minutes ? `${Math.max(8, (minutes / maxPracticeMinutes) * 100)}%` : "3px" }}
                          />
                        </div>
                        <span className={`text-[11px] font-semibold uppercase ${today ? "text-brand-300" : "app-muted"}`} aria-current={today ? "date" : undefined}>{WEEKDAYS[index]}</span>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold app-muted">Current streak</p><p className="mt-5 font-mono text-[1.65rem] font-semibold leading-none tracking-tight text-[var(--app-text)]">{metrics.streakDays} day{metrics.streakDays === 1 ? "" : "s"}</p><p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">Consecutive</p></div><span className="grid h-9 w-9 place-items-center rounded-lg border app-border bg-exit/10 text-exit"><Flame size={17} aria-hidden /></span></div></article>

              <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold app-muted">Closed trades</p><p className="mt-5 font-mono text-[1.65rem] font-semibold leading-none tracking-tight text-[var(--app-text)]">{metrics.closedTradesThisWeek}</p><p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">This week</p></div><span className="grid h-9 w-9 place-items-center rounded-lg border app-border bg-brand-400/10 text-brand-300"><ListChecks size={17} aria-hidden /></span></div></article>

              <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card sm:col-span-2 xl:col-span-2">
                <div className="flex h-full flex-col justify-center">
                  <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                    <div><p className="text-xs font-semibold app-muted">{metrics.winRateSampleSize ? `Last ${metrics.winRateSampleSize} trades` : "Recent results"}</p><div className="mt-2 flex items-baseline gap-2"><p className="font-mono text-2xl font-semibold leading-none text-[var(--app-text)]">{metrics.winRate === null ? "—" : `${metrics.winRate.toFixed(0)}%`}</p><span className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">win rate</span></div></div>
                    <dl className="flex gap-5">
                      <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] app-muted">Net P/L</dt><dd className={`mt-1 font-mono text-sm font-semibold ${metrics.winRateSampleSize ? pnlTone(recentNet.toNumber()) : "app-muted"}`}>{metrics.winRateSampleSize ? formatMoney(recentNet) : "—"}</dd></div>
                      <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] app-muted">Profit factor</dt><dd className="mt-1 font-mono text-sm font-semibold text-[var(--app-text)]">{metrics.recentProfitFactor === null ? "—" : metrics.recentProfitFactor.toFixed(2)}</dd></div>
                      <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] app-muted">W / L</dt><dd className="mt-1 font-mono text-sm font-semibold"><span className="text-profit">{metrics.winningTrades}</span><span className="app-muted"> / </span><span className="text-loss">{metrics.losingTrades}</span></dd></div>
                    </dl>
                  </div>
                  <div className="relative mt-3 grid h-14 shrink-0 gap-1" style={{ gridTemplateColumns: "repeat(30, minmax(0, 1fr))" }} role="img" aria-label={metrics.winRateSampleSize ? `Last ${metrics.winRateSampleSize} closed trades, oldest to latest: ${metrics.winningTrades} wins and ${metrics.losingTrades} losses, net ${formatMoney(recentNet)}. Bar height shows each trade's P/L.` : "No closed trades yet"}>
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[var(--app-border)]" />
                    {recentSlots.map((pnl, index) => {
                      const share = pnl === null || !maxAbsPnl ? 0 : Math.abs(pnl) / maxAbsPnl;
                      const height = `${Math.max(4, share * 50)}%`;
                      return (
                        <span key={index} className="relative block min-w-0" title={pnl === null ? "No trade" : formatMoney(new Decimal(pnl))}>
                          {pnl !== null && pnl > 0 && <span className="absolute inset-x-0 bottom-1/2 rounded-t-sm bg-profit" style={{ height }} />}
                          {pnl !== null && pnl < 0 && <span className="absolute inset-x-0 top-1/2 rounded-b-sm bg-loss" style={{ height }} />}
                          {pnl === 0 && <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[var(--app-muted)]" />}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex shrink-0 justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.1em] app-muted"><span>Oldest</span><span>{metrics.winRateSampleSize ? "Bar height = trade P/L" : "No closed trades"}</span><span>Latest</span></div>
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
