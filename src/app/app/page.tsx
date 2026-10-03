import type { Metadata } from "next";
import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  ChartNoAxesCombined,
  ShieldCheck,
} from "lucide-react";

import {
  SignedInDashboard,
  type DashboardSession,
} from "@/components/app/SignedInDashboard";
import { ensureUserProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Backtesting dashboard",
  description:
    "Review private forex backtesting sessions, trading performance, and recent strategy-testing activity.",
  robots: { index: false, follow: false },
};

interface SessionMetadataRow {
  id: string;
  name: string | null;
  symbols: unknown;
  archived: boolean;
}

interface SessionWinRateRow {
  sessionId: string;
  closedTrades: bigint;
  winningTrades: bigint;
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
      <section className="relative overflow-hidden rounded-3xl border border-brand-400/20 bg-[linear-gradient(135deg,rgba(20,184,166,0.13),rgba(17,23,37,0.7)_48%,rgba(59,107,255,0.08))] p-7 shadow-card sm:p-10">
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
            Save private sessions, resume replay, and review every decision from
            one focused workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={TRIAL_SIGN_UP_PATH} className="btn-primary shadow-glow">
              Start free trial <ArrowRight size={16} aria-hidden />
            </Link>
            <Link
              href="/sign-in?next=%2Faccount%2Fcontinue"
              className="btn-secondary"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
          Your testing record
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          Everything needed to continue and review
        </h2>
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
  const [sessionRows, activityEvents, recentTrades, closedTradesThisWeek] = await Promise.all([
    prisma.backtestSession.findMany({
      where: { userId: user.id, anonymous: false },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        symbol: true,
        timeframe: true,
        startTime: true,
        endTime: true,
        status: true,
        visibleIndex: true,
        visibleTime: true,
        totalCandles: true,
        startingBalance: true,
        depositedFunds: true,
        balance: true,
        maxDrawdown: true,
        maxDrawdownPercent: true,
        updatedAt: true,
      },
    }),
    prisma.productEvent.findMany({
      where: {
        userId: user.id,
        name: "backtest_activity",
        createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60_000) },
      },
      select: { createdAt: true },
    }),
    prisma.simulatedTrade.findMany({
      where: {
        session: { userId: user.id, anonymous: false },
        validity: { not: "experimental" },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { pnl: true },
    }),
    prisma.simulatedTrade.count({
      where: {
        session: { userId: user.id, anonymous: false },
        validity: { not: "experimental" },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
      },
    }),
  ]);

  // A full engine state can be several megabytes. The old dashboard selected
  // and parsed stateJson for as many as 100 sessions. PostgreSQL extracts the
  // three small pieces of dashboard metadata so Node never receives the large
  // JSON documents.
  const metadataRows = sessionRows.length
    ? await prisma.$queryRaw<SessionMetadataRow[]>(Prisma.sql`
        SELECT "id",
               NULLIF("stateJson"::jsonb #>> '{config,name}', '') AS "name",
               COALESCE(
                 "stateJson"::jsonb #> '{config,symbols}',
                 jsonb_build_array("symbol")
               ) AS "symbols",
               COALESCE(
                 ("stateJson"::jsonb #>> '{config,archived}')::boolean,
                 false
               ) AS "archived"
        FROM "BacktestSession"
        WHERE "id" IN (${Prisma.join(sessionRows.map((session) => session.id))})
      `)
    : [];
  const sessionWinRateRows = sessionRows.length
    ? await prisma.$queryRaw<SessionWinRateRow[]>(Prisma.sql`
        SELECT "sessionId",
               COUNT(*)::bigint AS "closedTrades",
               COUNT(*) FILTER (WHERE "pnl"::numeric > 0)::bigint AS "winningTrades"
        FROM "SimulatedTrade"
        WHERE "sessionId" IN (${Prisma.join(sessionRows.map((session) => session.id))})
          AND "validity" <> 'experimental'
        GROUP BY "sessionId"
      `)
    : [];
  const metadata = new Map(metadataRows.map((row) => [row.id, row]));
  const sessionWinRates = new Map(sessionWinRateRows.map((row) => [
    row.sessionId,
    {
      closedTrades: Number(row.closedTrades),
      winRate: Number(row.closedTrades) ? (Number(row.winningTrades) / Number(row.closedTrades)) * 100 : null,
    },
  ]));
  const sessions: DashboardSession[] = sessionRows.map((session) => {
    const details = metadata.get(session.id);
    const symbols = Array.isArray(details?.symbols)
      ? details.symbols.filter((value): value is string => typeof value === "string")
      : [];
    return {
      ...session,
      name: details?.name?.trim() || `${session.symbol} backtest`,
      symbols: symbols.length ? symbols : [session.symbol],
      archived: details?.archived ?? false,
    };
  });
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
  const activityDays = new Set(activityEvents.map((event) => todayKey.format(event.createdAt)));
  const now = new Date();
  const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayName);
  const currentDayKey = todayKey.format(now);
  const currentDay = new Date(`${currentDayKey}T00:00:00.000Z`);
  const monday = new Date(currentDay.getTime() - Math.max(0, weekdayIndex) * 24 * 60 * 60_000);
  const practiceMinutesByDay = Array.from({ length: 7 }, (_, index) => {
    const dayKey = new Date(monday.getTime() + index * 24 * 60 * 60_000).toISOString().slice(0, 10);
    return activityEvents.filter((event) => todayKey.format(event.createdAt) === dayKey).length;
  });
  const practiceMinutes = practiceMinutesByDay.reduce((total, minutes) => total + minutes, 0);
  const cursor = new Date();
  if (!activityDays.has(todayKey.format(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streakDays = 0;
  for (let offset = 0; offset < 60 && activityDays.has(todayKey.format(cursor)); offset += 1) {
    streakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const wins = recentTrades.filter((trade) => Number(trade.pnl) > 0).length;
  const losses = recentTrades.filter((trade) => Number(trade.pnl) < 0).length;

  const displayName =
    typeof user.user_metadata?.display_name === "string" &&
    user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name.trim()
      : user.email?.split("@")[0] ?? "Trader";

  return (
    <SignedInDashboard
      sessions={sessions.map((session) => ({
        ...session,
        sessionWinRate: sessionWinRates.get(session.id) ?? { closedTrades: 0, winRate: null },
      }))}
      displayName={displayName}
      metrics={{
        practiceMinutes,
        practiceMinutesByDay,
        currentWeekdayIndex: Math.max(0, weekdayIndex),
        streakDays,
        closedTradesThisWeek,
        winRate: recentTrades.length ? (wins / recentTrades.length) * 100 : null,
        winRateSampleSize: recentTrades.length,
        winningTrades: wins,
        losingTrades: losses,
        recentOutcomes: recentTrades
          .map((trade): "win" | "loss" | "flat" => Number(trade.pnl) > 0 ? "win" : Number(trade.pnl) < 0 ? "loss" : "flat")
          .reverse(),
      }}
    />
  );
}
