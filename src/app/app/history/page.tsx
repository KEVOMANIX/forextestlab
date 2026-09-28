import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, Play, Rows3 } from "lucide-react";

import { prisma } from "@/lib/db";
import { formatNewYorkDate } from "@/lib/date-time";
import { Decimal } from "@/lib/decimal";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { DeleteSessionButton } from "@/components/app/DeleteSessionButton";
import { formatSymbol } from "@/lib/market-data/symbols";
import { replayDayLabel, replayDayPercent } from "@/lib/backtest/replay-progress";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

export const metadata: Metadata = {
  title: "Sessions",
  description: "Your ForexTestLab simulated backtest sessions.",
  alternates: { canonical: "/app/history" },
};

export const dynamic = "force-dynamic";

function netResult(session: { balance: string; startingBalance: string; depositedFunds: string }) {
  return new Decimal(session.balance)
    .minus(session.startingBalance)
    .minus(session.depositedFunds);
}

function formatSignedMoney(value: Decimal) {
  const amount = value.abs().toFixed(2);
  return `${value.isZero() ? "" : value.isPositive() ? "+" : "−"}$${amount}`;
}

function replayTime(session: { startTime: bigint; endTime: bigint; visibleTime: bigint | null; visibleIndex: number; timeframe: string }) {
  if (session.visibleTime != null) return Number(session.visibleTime);
  const step = TIMEFRAME_MS[session.timeframe as keyof typeof TIMEFRAME_MS] ?? 0;
  return Math.min(Number(session.endTime), Number(session.startTime) + Math.max(0, session.visibleIndex) * step);
}

function replayProgress(session: { startTime: bigint; endTime: bigint; visibleTime: bigint | null; visibleIndex: number; timeframe: string; status: string }) {
  if (session.status === "finished") return 100;
  return replayDayPercent({
    startTime: Number(session.startTime),
    endTime: Number(session.endTime),
    currentTime: replayTime(session),
  });
}

export default async function HistoryPage() {
  const user = await requireUser("/app/history");
  await ensureUserProfile(user);
  const sessions = await prisma.backtestSession.findMany({
    where: { userId: user.id, anonymous: false },
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: {
      id: true,
      symbol: true,
      timeframe: true,
      status: true,
      startTime: true,
      endTime: true,
      visibleTime: true,
      visibleIndex: true,
      startingBalance: true,
      depositedFunds: true,
      balance: true,
      updatedAt: true,
      _count: { select: { trades: true } },
    },
  });

  const totalNet = sessions.reduce((sum, session) => sum.plus(netResult(session)), new Decimal(0));
  const totalTrades = sessions.reduce((sum, session) => sum + session._count.trades, 0);
  const marketCount = new Set(sessions.map((session) => session.symbol)).size;

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9">
      <header className="flex items-end justify-between border-b app-border pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Sessions</h1>
        </div>
        <p className="text-xs app-muted">{sessions.length} session{sessions.length === 1 ? "" : "s"}</p>
      </header>

      {sessions.length === 0 ? (
        <section className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed app-border bg-[var(--app-panel)]/45 p-8 text-center">
          <div>
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><Rows3 size={19} aria-hidden /></span>
            <h2 className="mt-4 text-lg font-semibold">Your session library is empty</h2>
            <p className="mt-1 text-sm app-muted">Start a backtest and it will be saved here automatically.</p>
            <Link href="/app/backtest" className="btn-primary mt-5 inline-flex">Start a backtest <ArrowRight size={15} aria-hidden /></Link>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Session library summary">
            {[
              ["Sessions", String(sessions.length)],
              ["Markets", String(marketCount)],
              ["Closed trades", String(totalTrades)],
              ["Net P/L", formatSignedMoney(totalNet)],
            ].map(([label, value], index) => (
              <article key={label} className="rounded-xl border app-border bg-[var(--app-panel)]/55 px-4 py-3">
                <p className="text-[11px] font-medium app-muted">{label}</p>
                <p className={`mt-1 font-mono text-xl font-semibold ${index === 3 ? totalNet.isNegative() ? "text-loss" : !totalNet.isZero() && totalNet.isPositive() ? "text-profit" : "" : ""}`}>{value}</p>
              </article>
            ))}
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)]/45" aria-label="Saved sessions">
            <div className="divide-y app-border">
              {sessions.map((session) => {
                const net = netResult(session);
                const finished = session.status === "finished";
                const sessionLabel = `${formatSymbol(session.symbol)} · ${formatNewYorkDate(Number(session.startTime), { month: "short", year: "numeric" })}`;
                const progress = replayProgress(session);
                const replayPosition = replayTime(session);
                return (
                  <article key={session.id} className="flex flex-col gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.025] xl:flex-row xl:items-center xl:gap-8">
                    <div className="flex min-w-0 items-center gap-3 xl:w-[26rem] xl:shrink-0">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-brand-400/25 bg-brand-400/[0.08] font-mono text-[11px] font-bold text-brand-200">{formatSymbol(session.symbol).slice(0, 3)}</span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{sessionLabel}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] app-muted"><span>{session.timeframe}</span><span aria-hidden>•</span><span>{formatNewYorkDate(session.updatedAt.getTime(), { month: "short", day: "numeric" })}</span></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs app-muted xl:w-[20rem] xl:shrink-0"><CalendarDays size={14} className="shrink-0 text-brand-300" aria-hidden /><span>{formatNewYorkDate(Number(session.startTime), { month: "short", day: "numeric", year: "numeric" })} – {formatNewYorkDate(Number(session.endTime), { month: "short", day: "numeric", year: "numeric" })}</span></div>
                    <div className="xl:w-40 xl:shrink-0">
                      <div className="flex items-center justify-end text-[11px] app-muted"><span className="font-mono font-semibold text-[var(--app-text)]">{progress.toFixed(0)}%</span></div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div>
                      <span className="mt-1.5 block text-[10px] app-muted">{session.status === "finished" ? "Complete" : replayDayLabel({ startTime: Number(session.startTime), endTime: Number(session.endTime), currentTime: replayPosition })}</span>
                    </div>
                    <div className="xl:ml-6 xl:w-24 xl:shrink-0"><p className={`font-mono text-sm font-semibold ${net.isNegative() ? "text-loss" : !net.isZero() && net.isPositive() ? "text-profit" : ""}`}>{formatSignedMoney(net)}</p></div>
                    <div className="flex items-center gap-2 xl:ml-auto">
                      {!finished && <Link href={`/app/backtest?session=${encodeURIComponent(session.id)}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-500 px-3 text-[11px] font-bold text-surface-950 transition-colors hover:bg-brand-400"><Play size={12} aria-hidden /> Resume</Link>}
                      <Link href={`/app/results/${session.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border app-border px-2.5 text-[11px] font-semibold app-muted transition-colors hover:border-brand-400/35 hover:text-brand-300"><BarChart3 size={13} aria-hidden /> Analytics</Link>
                      <DeleteSessionButton sessionId={session.id} iconOnly redirectAfterDelete={false} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
