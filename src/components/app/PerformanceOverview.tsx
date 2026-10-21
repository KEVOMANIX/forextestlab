"use client";

import Link from "next/link";
import { Clock3, Flame, ListChecks, Scale, Target, TrendingDown, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

import {
  PERFORMANCE_PERIOD_COOKIE,
  PERFORMANCE_PERIODS,
  PERIOD_LABELS,
  type PerformancePeriod,
  type PracticePerformance,
} from "@/lib/backtest/practice-performance";
import { Decimal } from "@/lib/decimal";

export interface WeekSummary {
  practiceMinutes: number;
  practiceMinutesByDay: number[];
  /** New York calendar date (YYYY-MM-DD) of this week's Monday. */
  weekStart: string;
  currentWeekdayIndex: number;
  streakDays: number;
  closedTradesThisWeek: number;
}

/** Below this many trades the figures are mostly luck; say so. */
const EARLY_DAYS_TRADES = 20;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const CHART_WIDTH = 600;
const CHART_HEIGHT = 230;
const MOTION = "animate-fade-up motion-reduce:animate-none";

function formatMoney(value: Decimal | string | number, signed = true): string {
  const amount = new Decimal(value);
  const sign = amount.isZero() ? "" : amount.isNegative() ? "−" : signed ? "+" : "";
  const [whole, fraction] = amount.abs().toFixed(2).split(".");
  return `${sign}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

/** "$25.8K" for the small print. */
function shortMoney(value: string): string {
  const amount = Math.abs(Number(value));
  return amount >= 1000 ? `$${(amount / 1000).toFixed(1)}K` : `$${amount.toFixed(0)}`;
}

function tone(value: string | number): string {
  const amount = Number(value);
  return amount > 0 ? "text-profit" : amount < 0 ? "text-loss" : "app-muted";
}

function formatPracticeTime(minutes: number): string {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** "19–25 Oct", or "28 Sep – 4 Oct" across a month boundary. */
function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60_000);
  const month = (value: Date) => new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(value);
  return month(start) === month(end)
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${month(end)}`
    : `${start.getUTCDate()} ${month(start)} – ${end.getUTCDate()} ${month(end)}`;
}

/** A step of 1, 2 or 5 × 10ⁿ giving about four gridlines across the range. */
function niceStep(range: number): number {
  const raw = range / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function PeriodSwitch({ period }: { period: PerformancePeriod }) {
  return (
    <nav aria-label="Performance period" className="inline-flex rounded-lg border app-border bg-[var(--app-panel)] p-1">
      {PERFORMANCE_PERIODS.map((option) => (
        <Link
          key={option}
          href={`/app?period=${option}`}
          scroll={false}
          aria-current={option === period ? "true" : undefined}
          onClick={() => { document.cookie = `${PERFORMANCE_PERIOD_COOKIE}=${option}; path=/; max-age=31536000; samesite=lax`; }}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${option === period ? "bg-brand-500 text-surface-950" : "app-muted hover:text-[var(--app-text)]"}`}
        >
          {PERIOD_LABELS[option]}
        </Link>
      ))}
    </nav>
  );
}

function Stat({ icon: Icon, iconTone, label, value, valueTone, detail, title, index }: {
  icon: LucideIcon;
  iconTone: string;
  label: string;
  value: string;
  valueTone: string;
  detail?: React.ReactNode;
  title: string;
  index: number;
}) {
  return (
    <div className={`flex min-w-[10rem] flex-1 gap-3 px-4 py-1 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-[var(--app-panel-2)] ${MOTION}`} style={{ animationDelay: `${index * 70}ms` }} title={title}>
      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconTone}`}><Icon size={16} aria-hidden /></span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold app-muted">{label}</dt>
        <dd className={`mt-1 font-mono text-[1.35rem] font-semibold leading-none ${valueTone}`}>{value}</dd>
        {detail && <dd className="mt-1.5 text-[11px] app-muted">{detail}</dd>}
      </div>
    </div>
  );
}

function StatBar({ performance }: { performance: PracticePerformance }) {
  const drawdown = new Decimal(performance.maxDrawdown);
  // Literal class names: Tailwind only generates classes it can find in source.
  const profitWash = "bg-profit/10 text-profit";
  const lossWash = "bg-loss/10 text-loss";
  return (
    <dl className="mt-4 flex flex-wrap gap-y-4 rounded-2xl border app-border bg-[var(--app-panel)] px-5 py-4 shadow-card">
      <Stat index={0} icon={Wallet} iconTone={Number(performance.netPnl) < 0 ? lossWash : profitWash} label="Net P/L" value={formatMoney(performance.netPnl)} valueTone={tone(performance.netPnl)} title="Everything won minus everything lost over these trades." />
      <Stat index={1} icon={TrendingUp} iconTone="bg-brand-400/10 text-brand-300" label="Avg per trade" value={formatMoney(performance.averagePerTrade)} valueTone={tone(performance.averagePerTrade)} title="Net P/L divided by the number of trades, also called expectancy." />
      <Stat index={2} icon={Scale} iconTone="bg-brand-400/10 text-brand-300" label="Profit factor" value={performance.profitFactor === null ? "—" : performance.profitFactor.toFixed(2)} valueTone="text-[var(--app-text)]" detail={`${shortMoney(performance.grossProfit)} won · ${shortMoney(performance.grossLoss)} lost`} title="Money won divided by money lost. Above 1.00 is profitable." />
      <Stat index={3} icon={Target} iconTone="bg-brand-400/10 text-brand-300" label="Win rate" value={`${performance.winRate.toFixed(0)}%`} valueTone="text-[var(--app-text)]" detail={<><span className="text-profit">{performance.wins} W</span> · <span className="text-loss">{performance.losses} L</span></>} title="Share of trades that closed in profit." />
      <Stat index={4} icon={TrendingDown} iconTone={lossWash} label="Max drawdown" value={drawdown.isZero() ? "$0.00" : formatMoney(drawdown.negated())} valueTone={drawdown.isZero() ? "app-muted" : "text-loss"} title="The largest fall from a high point of your running total." />
    </dl>
  );
}

function CumulativeChart({ performance }: { performance: PracticePerformance }) {
  const points = [{ n: 0, total: 0 }, ...performance.curve];
  const totals = points.map((point) => point.total);
  let low = Math.min(0, ...totals);
  let high = Math.max(0, ...totals);
  const padding = (high - low || 1) * 0.08;
  low -= padding;
  high += padding;
  const step = niceStep(high - low);
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) ticks.push(Math.round(tick * 100) / 100);
  // Every position is in pixels of the plot box alone, so labels and markers sit
  // exactly on their gridlines and points.
  const y = (value: number) => (1 - (value - low) / (high - low)) * CHART_HEIGHT;
  const x = (n: number) => (n / performance.tradeCount) * CHART_WIDTH;
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(point.n).toFixed(1)},${y(point.total).toFixed(1)}`).join(" ");
  const zero = y(0).toFixed(1);
  const trough = performance.troughN === null ? null : points.find((point) => point.n === performance.troughN) ?? null;
  const last = points[points.length - 1]!;
  const troughLeft = trough ? (trough.n / performance.tradeCount) * 100 : 0;

  return (
    <div className="mt-3" role="img" aria-label={`Cumulative P/L over ${performance.tradeCount} practice trades, ending at ${formatMoney(performance.netPnl)}.${trough ? ` The largest drawdown was ${formatMoney(new Decimal(performance.maxDrawdown).negated())}.` : ""}`}>
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="block h-full w-full animate-reveal-x motion-reduce:animate-none" aria-hidden>
          {ticks.map((tick) => (
            <line key={tick} x1="0" x2={CHART_WIDTH} y1={y(tick)} y2={y(tick)} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={tick === 0 ? undefined : "4 4"} style={{ stroke: tick === 0 ? "var(--app-border)" : "var(--app-panel-2)" }} />
          ))}
          <path d={`${line} L${CHART_WIDTH},${zero} L0,${zero} Z`} style={{ fill: "var(--app-accent-wash)" }} />
          <path d={line} fill="none" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--app-accent)" }} />
        </svg>
        {ticks.map((tick) => (
          <span key={tick} className="absolute left-0 -translate-y-1/2 rounded bg-[var(--app-panel)] px-1.5 font-mono text-[11px] app-muted" style={{ top: y(tick) }}>{tick === 0 ? "$0" : formatMoney(tick).replace(".00", "")}</span>
        ))}
        {trough && (
          // Fade by opacity only: a transform here would re-anchor the marker
          // to this wrapper and drop it below the chart.
          <div className="animate-fade-in motion-reduce:animate-none" style={{ animationDelay: "900ms" }}>
            <span aria-hidden className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--app-panel)] bg-loss" style={{ left: `${troughLeft}%`, top: y(trough.total) }} />
            <span className={`absolute whitespace-nowrap rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-0.5 text-[11px] font-semibold ${troughLeft > 70 ? "-translate-x-[calc(100%+10px)]" : "translate-x-2.5"} ${y(trough.total) > CHART_HEIGHT - 30 ? "-translate-y-[130%]" : "translate-y-1"}`} style={{ left: `${troughLeft}%`, top: y(trough.total) }}>Max drawdown</span>
          </div>
        )}
        <span aria-hidden className="absolute right-0 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full bg-brand-400 shadow-glow animate-pulse-soft motion-reduce:animate-none" style={{ top: y(last.total) }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-[0.1em] app-muted"><span>Oldest</span><span>Latest</span></div>
    </div>
  );
}

function WinnersCard({ performance }: { performance: PracticePerformance }) {
  const { averageWin, averageLoss, winLossRatio, breakEvenWinRate } = performance;
  const edge = breakEvenWinRate === null ? null : Math.round(performance.winRate - breakEvenWinRate);
  const lossWidth = winLossRatio ? Math.min(100, 100 / winLossRatio) : 100;
  return (
    <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card">
      <h3 className="font-semibold">Winners vs losers</h3>
      <div className="mt-3.5">
        <div className="flex justify-between text-sm"><span>Average win</span><span className="font-mono font-semibold text-profit">{averageWin ? formatMoney(averageWin) : "—"}</span></div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--app-panel-2)]"><div className="h-full origin-left animate-grow-x rounded-full bg-profit motion-reduce:animate-none" style={{ width: averageWin ? "100%" : "0%" }} /></div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-sm"><span>Average loss</span><span className="font-mono font-semibold text-loss">{averageLoss ? formatMoney(new Decimal(averageLoss).negated()) : "—"}</span></div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--app-panel-2)]"><div className="h-full origin-left animate-grow-x rounded-full bg-loss motion-reduce:animate-none" style={{ width: averageLoss ? `${lossWidth}%` : "0%", animationDelay: "150ms" }} /></div>
      </div>
      <p className="mt-4 text-sm leading-6">
        {edge !== null && breakEvenWinRate !== null ? (
          <>You win <strong>{performance.winRate.toFixed(0)}%</strong> of trades,{" "}
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${edge >= 0 ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"}`}>{Math.abs(edge)} point{Math.abs(edge) === 1 ? "" : "s"} {edge >= 0 ? "above" : "below"}</span>{" "}
            your <strong>{breakEvenWinRate.toFixed(0)}%</strong> break-even.</>
        ) : !averageLoss ? "No losing trades in this period yet." : "No winning trades in this period yet."}
      </p>
    </article>
  );
}

function WeekCard({ week }: { week: WeekSummary }) {
  const days = week.practiceMinutesByDay.length === 7 ? week.practiceMinutesByDay : [0, 0, 0, 0, 0, 0, 0];
  const most = Math.max(1, ...days);
  const range = formatWeekRange(week.weekStart);
  const row = "flex items-center gap-3 border-t border-[var(--app-panel-2)] py-2.5 first:border-t-0 first:pt-0";
  return (
    <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card" aria-labelledby="this-week">
      <h3 id="this-week" className="font-semibold">This week{range && <span className="font-medium app-muted"> · {range}</span>}</h3>
      <dl className="mt-3">
        <div className={row}>
          <Clock3 size={16} className="shrink-0 text-brand-300" aria-hidden />
          <dt className="flex-1 text-sm">Practice</dt>
          <dd className="flex h-6 items-end gap-[3px]" role="img" aria-label={`Practice minutes Monday to Sunday: ${days.map((minutes, index) => index > week.currentWeekdayIndex ? "upcoming" : minutes).join(", ")}`}>
            {days.map((minutes, index) => (
              <span key={index} title={`${WEEKDAYS[index]}: ${minutes} min`} className={`w-1.5 rounded-sm ${minutes ? "bg-brand-500" : index > week.currentWeekdayIndex ? "bg-[var(--app-panel-2)]" : "bg-[var(--app-border)]"} ${index === week.currentWeekdayIndex ? "ring-1 ring-brand-300 ring-offset-1 ring-offset-[var(--app-panel)]" : ""}`} style={{ height: minutes ? `${Math.max(25, (minutes / most) * 100)}%` : "3px" }} />
            ))}
          </dd>
          <dd className="w-16 text-right font-mono text-sm font-semibold">{formatPracticeTime(week.practiceMinutes)}</dd>
        </div>
        <div className={row}>
          <Flame size={16} className="shrink-0 text-exit" aria-hidden />
          <dt className="flex-1 text-sm">Streak</dt>
          <dd className="font-mono text-sm font-semibold">{week.streakDays} day{week.streakDays === 1 ? "" : "s"}</dd>
        </div>
        <div className={row}>
          <ListChecks size={16} className="shrink-0 text-brand-300" aria-hidden />
          <dt className="flex-1 text-sm">Practice trades</dt>
          <dd className="font-mono text-sm font-semibold">{week.closedTradesThisWeek}</dd>
        </div>
      </dl>
    </article>
  );
}

/** Practice results for a chosen period, with this week's activity beside them. */
export function PerformanceOverview({ performance, period, week }: {
  performance: PracticePerformance | null;
  period: PerformancePeriod;
  week: WeekSummary;
}) {
  const count = performance?.tradeCount ?? 0;
  const meta = !count
    ? period === "all" ? "No practice trades yet" : `No practice trades in the last ${PERIOD_LABELS[period]}`
    : count < EARLY_DAYS_TRADES
      ? `${count} trade${count === 1 ? "" : "s"} · early days, these settle after about 30`
      : `${count.toLocaleString("en-US")} trades · challenges not included`;
  return (
    <section className="mt-7" aria-labelledby="practice-performance">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Performance</p>
          <h2 id="practice-performance" className="mt-1.5 text-xl font-semibold">Your practice results</h2>
          <p className="mt-1 text-sm app-muted">{meta}</p>
        </div>
        <PeriodSwitch period={period} />
      </div>

      {performance && <StatBar performance={performance} />}
      <div className="mt-3 flex flex-wrap gap-3">
        {performance ? (
          <article className="min-w-0 flex-[1.8_1_30rem] rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card">
            <h3 className="font-semibold">Cumulative P/L</h3>
            <CumulativeChart performance={performance} />
          </article>
        ) : (
          <div className="grid min-h-40 min-w-0 flex-[1.8_1_30rem] place-items-center rounded-2xl border border-dashed app-border p-6 text-center text-sm app-muted">
            {period === "all" ? "Close a practice trade and your results appear here." : "Try a longer period, or close a practice trade."}
          </div>
        )}
        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-3">
          {performance && <WinnersCard performance={performance} />}
          <WeekCard week={week} />
        </div>
      </div>
    </section>
  );
}
