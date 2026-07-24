"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Filter,
  Gauge,
  LockKeyhole,
  Percent,
  Scale,
  Search,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import {
  formatNewYorkDateTime,
  getNewYorkDateParts,
  getTradingSession,
  newYorkMonthKey,
} from "@/lib/date-time";
import { TradesTable } from "./TradesTable";

type TradeFilter = "all" | "long" | "short" | "winners" | "losers";
type AnalyticsTab = "overview" | "risk" | "timing" | "trades";

// Viewbox geometry shared by the SVG line/area charts.
const W = 760;
const H = 220;
const PAD = 18;

// Brand-consistent chart palette. Green/red are a *diverging* pair for
// profit polarity; blue is the secondary account series; amber is a 4th
// categorical hue used only where a legend + labels disambiguate it.
const C = {
  pos: "#22c3a0", // brand-400 — wins / equity / take-profit
  neg: "#f4646c", // bear — losses / stop-loss
  blue: "#5b8bff", // accent-400 — balance / manual
  amber: "#fbbf24", // session-end
  grid: "rgba(148,161,184,0.16)",
} as const;

function money(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Deterministic compact currency. Intl's "compact" notation differs between
// Node's ICU (server) and the browser (client) — e.g. "$25.0K" vs "$25K" — which
// triggers a React hydration mismatch. Plain arithmetic renders identically in
// both environments.
function compactMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}$${abs.toFixed(1)}`;
}

function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

function durationLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function linePath(values: number[], width = W, height = H, pad = PAD) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const x = (index: number) => pad + index * ((width - pad * 2) / Math.max(1, values.length - 1));
  const y = (value: number) => pad + (1 - (value - min) / spread) * (height - pad * 2);
  return {
    path: values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" "),
    x,
    y,
    min,
    max,
  };
}

function EmptyChart({ text = "Not enough trades to build this chart yet." }: { text?: string }) {
  return (
    <div className="grid min-h-44 place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/35 p-6 text-center text-sm app-muted">
      {text}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; muted?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
      {items.map((item) => (
        <span key={item.label} className={`flex items-center gap-1.5 ${item.muted ? "app-muted" : ""}`}>
          <i className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  legend,
  toolbar,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`panel min-w-0 p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="mt-1 text-xs app-muted">{subtitle}</p>}
        </div>
        {toolbar}
      </div>
      {legend && <div className="mt-3">{legend}</div>}
      <div className="mt-4">{children}</div>
    </article>
  );
}

/* ─────────────────────────── Hero summary ─────────────────────────── */

function HeroSummary({
  net,
  returnPct,
  points,
  startingBalance,
  endingBalance,
  trades,
  winRate,
  profitFactor,
}: {
  net: number;
  returnPct: number;
  points: EquityPoint[];
  startingBalance: number;
  endingBalance: number;
  trades: number;
  winRate: number | null;
  profitFactor: string;
}) {
  const positive = net >= 0;
  const spark = useMemo(() => {
    const values = points.map((p) => Number(p.equity));
    if (values.length < 2) return null;
    const stride = Math.max(1, Math.ceil(values.length / 220));
    const sampled = values.filter((_, i) => i % stride === 0);
    if (sampled.at(-1) !== values.at(-1)) sampled.push(values.at(-1)!);
    return linePath(sampled, 320, 96, 4);
  }, [points]);

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6" aria-label="Session performance summary">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: positive
            ? "radial-gradient(120% 120% at 0% 0%, rgba(34,195,160,0.10), transparent 55%)"
            : "radial-gradient(120% 120% at 0% 0%, rgba(244,100,108,0.10), transparent 55%)",
        }}
      />
      <div className="relative grid gap-6 lg:grid-cols-[1.1fr_1.4fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">Net profit &amp; loss</p>
          <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className={`font-mono text-4xl font-bold tracking-tight sm:text-5xl ${positive ? "text-brand-300" : "text-bear"}`}>
              {money(net)}
            </span>
            <span
              className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                positive ? "bg-brand-400/12 text-brand-300" : "bg-bear/12 text-bear"
              }`}
            >
              {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {pct(returnPct)}
            </span>
          </div>
          <p className="mt-2 font-mono text-xs app-muted">
            {compactMoney(startingBalance)} → <span className="text-[var(--app-text)]">{compactMoney(endingBalance)}</span>
          </p>
          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            {[
              { k: "Trades", v: String(trades) },
              { k: "Win rate", v: winRate === null ? "—" : pct(winRate) },
              { k: "Profit factor", v: profitFactor },
            ].map((item) => (
              <div key={item.k} className="rounded-lg border app-border bg-[var(--app-panel-2)]/50 py-2.5">
                <dt className="text-[10px] uppercase tracking-wide app-muted">{item.k}</dt>
                <dd className="mt-1 font-mono text-sm font-semibold">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-[11px] app-muted">
            <span>Account equity</span>
            <span>{points.length.toLocaleString()} snapshots</span>
          </div>
          <div className="rounded-xl border app-border bg-[var(--app-panel-2)]/50 p-2">
            {spark ? (
              <svg viewBox="0 0 320 96" className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Equity curve summary">
                <defs>
                  <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={positive ? C.pos : C.neg} stopOpacity="0.28" />
                    <stop offset="1" stopColor={positive ? C.pos : C.neg} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${spark.path} L316,92 L4,92 Z`} fill="url(#hero-spark)" />
                <path d={spark.path} fill="none" stroke={positive ? C.pos : C.neg} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            ) : (
              <div className="grid h-28 place-items-center text-xs app-muted">Replay further to build the equity curve.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Charts ─────────────────────────── */

function EquityDrawdownChart({ points, trades }: { points: EquityPoint[]; trades: ClosedTrade[] }) {
  const [range, setRange] = useState<"all" | "500" | "100">("all");
  const [hovered, setHovered] = useState<number | null>(null);
  const sampled = useMemo(() => {
    const limit = range === "all" ? points.length : Number(range);
    const source = points.slice(-limit);
    const stride = Math.max(1, Math.ceil(source.length / 360));
    const result = source.filter((_, index) => index % stride === 0);
    const final = source.at(-1);
    if (final && result.at(-1)?.time !== final.time) result.push(final);
    return result;
  }, [points, range]);
  if (sampled.length < 2) return <EmptyChart text="Replay this session further to build equity and drawdown history." />;

  const equity = sampled.map((point) => Number(point.equity));
  const balance = sampled.map((point) => Number(point.balance));
  let peak = equity[0]!;
  const drawdowns = equity.map((value) => {
    peak = Math.max(peak, value);
    return peak - value;
  });
  const minValue = Math.min(...equity, ...balance);
  const maxValue = Math.max(...equity, ...balance);
  const valueSpread = maxValue - minValue || 1;
  const x = (index: number) => PAD + index * ((W - PAD * 2) / Math.max(1, sampled.length - 1));
  const y = (value: number) => PAD + (1 - (value - minValue) / valueSpread) * (H - PAD * 2);
  const eqPath = equity.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const balPath = balance.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const dd = linePath(drawdowns, W, 90, 12);
  const activeIndex = hovered ?? sampled.length - 1;
  const active = sampled[activeIndex]!;
  // Horizontal gridlines with value labels.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: minValue + t * valueSpread, yy: y(minValue + t * valueSpread) }));
  const markerIndexes = trades.slice(-80).map((trade) => {
    let closest = 0;
    let distance = Infinity;
    sampled.forEach((point, index) => {
      const next = Math.abs(point.time - trade.exitTime);
      if (next < distance) {
        distance = next;
        closest = index;
      }
    });
    return { trade, index: closest };
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Legend items={[{ label: "Equity", color: C.pos }, { label: "Balance", color: C.blue, muted: true }]} />
        <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1">
          {([["all", "All"], ["500", "Recent 500"], ["100", "Recent 100"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setRange(id);
                setHovered(null);
              }}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${range === id ? "bg-white/[0.08]" : "app-muted hover:text-brand-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]/50">
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border app-border bg-[var(--app-panel)]/95 px-3 py-2 text-[11px] shadow-lg">
          <p className="app-muted">{formatNewYorkDateTime(active.time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <p className="mt-1 flex gap-3 font-mono font-semibold">
            <span className="text-brand-300">E ${Number(active.equity).toFixed(2)}</span>
            <span style={{ color: C.blue }}>B ${Number(active.balance).toFixed(2)}</span>
            <span className="text-bear">DD ${drawdowns[activeIndex]!.toFixed(2)}</span>
          </p>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-64 w-full touch-none"
          preserveAspectRatio="none"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setHovered(Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (sampled.length - 1)));
          }}
          onPointerLeave={() => setHovered(null)}
          role="img"
          aria-label="Interactive equity and balance with trade markers"
        >
          <defs>
            <linearGradient id="analytics-equity-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.pos} stopOpacity=".24" />
              <stop offset="1" stopColor={C.pos} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick, i) => (
            <line key={i} x1={PAD} x2={W - PAD} y1={tick.yy} y2={tick.yy} stroke={C.grid} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${eqPath} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`} fill="url(#analytics-equity-fill)" />
          <path d={balPath} fill="none" stroke={C.blue} strokeWidth="1.75" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          <path d={eqPath} fill="none" stroke={C.pos} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {markerIndexes.map(({ trade, index }) => (
            <circle key={trade.id} cx={x(index)} cy={y(equity[index]!)} r="2.6" fill={Number(trade.pnl) >= 0 ? C.pos : C.neg}>
              <title>{`${trade.direction} ${money(Number(trade.pnl))}`}</title>
            </circle>
          ))}
          <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PAD} y2={H - PAD} stroke="currentColor" strokeOpacity=".25" strokeDasharray="4 4" />
          <circle cx={x(activeIndex)} cy={y(equity[activeIndex]!)} r="4" fill={C.pos} stroke="var(--app-panel)" strokeWidth="1.5" />
        </svg>
        {/* y-axis labels overlaid (non-stretched) */}
        <div className="pointer-events-none absolute right-2 top-0 flex h-64 flex-col justify-between py-3 text-right font-mono text-[9px] app-muted">
          <span>{compactMoney(maxValue)}</span>
          <span>{compactMoney(minValue + valueSpread / 2)}</span>
          <span>{compactMoney(minValue)}</span>
        </div>
        <div className="border-t app-border px-3 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider app-muted">Drawdown underwater</p>
          <svg viewBox="0 0 760 90" className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Drawdown chart">
            <path d={`${dd.path} L748,78 L12,78 Z`} fill="rgba(244,100,108,.18)" />
            <path d={dd.path} fill="none" stroke={C.neg} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <line x1={dd.x(activeIndex)} x2={dd.x(activeIndex)} y1="12" y2="78" stroke="currentColor" strokeOpacity=".2" strokeDasharray="4 4" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function CumulativePnlChart({ trades, hovered, onHover }: { trades: ClosedTrade[]; hovered: number | null; onHover: (index: number | null) => void }) {
  if (!trades.length) return <EmptyChart />;
  let total = 0;
  const values = [0, ...trades.map((trade) => (total += Number(trade.pnl)))];
  const chart = linePath(values);
  const active = hovered == null ? values.length - 1 : Math.min(values.length - 1, hovered + 1);
  const positive = values.at(-1)! >= 0;
  const color = positive ? C.pos : C.neg;
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border app-border bg-[var(--app-panel)]/95 px-2 py-1 text-[11px] shadow">
        <span className="app-muted">Trade {active}</span> <span className="font-mono font-semibold">{money(values[active]!)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-52 w-full touch-none"
        preserveAspectRatio="none"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          onHover(Math.max(0, Math.min(trades.length - 1, Math.round(((event.clientX - box.left) / box.width) * (trades.length - 1)))));
        }}
        onPointerLeave={() => onHover(null)}
        role="img"
        aria-label="Cumulative profit and loss by trade"
      >
        <defs>
          <linearGradient id="cum-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD} x2={W - PAD} y1={chart.y(0)} y2={chart.y(0)} stroke={C.grid} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={`${chart.path} L${chart.x(values.length - 1)},${chart.y(chart.min < 0 && chart.max > 0 ? 0 : chart.min)} L${chart.x(0)},${chart.y(chart.min < 0 && chart.max > 0 ? 0 : chart.min)} Z`} fill="url(#cum-fill)" />
        <path d={chart.path} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <line x1={chart.x(active)} x2={chart.x(active)} y1={PAD} y2={H - PAD} stroke="currentColor" strokeOpacity=".22" strokeDasharray="4 4" />
        <circle cx={chart.x(active)} cy={chart.y(values[active]!)} r="4" fill={color} stroke="var(--app-panel)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function RollingWinRateChart({ trades }: { trades: ClosedTrade[] }) {
  const windowSize = Math.min(20, Math.max(5, Math.floor(trades.length / 4)));
  if (trades.length < windowSize + 2) return <EmptyChart text="Not enough trades for a rolling win-rate window yet." />;
  const rates: number[] = [];
  for (let i = windowSize - 1; i < trades.length; i++) {
    const slice = trades.slice(i - windowSize + 1, i + 1);
    const wins = slice.filter((t) => Number(t.pnl) > 0).length;
    rates.push((wins / windowSize) * 100);
  }
  const x = (i: number) => PAD + i * ((W - PAD * 2) / Math.max(1, rates.length - 1));
  const y = (v: number) => PAD + (1 - v / 100) * (H - PAD * 2);
  const path = rates.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const latest = rates.at(-1)!;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" preserveAspectRatio="none" role="img" aria-label={`Rolling ${windowSize}-trade win rate`}>
        {[0, 25, 50, 75, 100].map((g) => (
          <line key={g} x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} stroke={g === 50 ? "rgba(148,161,184,0.35)" : C.grid} strokeWidth="1" strokeDasharray={g === 50 ? "5 4" : undefined} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path} fill="none" stroke={latest >= 50 ? C.pos : C.neg} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] app-muted">
        <span>{windowSize}-trade rolling window · 50% dashed baseline</span>
        <span className="font-mono">Latest {pct(latest, 0)}</span>
      </div>
    </div>
  );
}

function PnlHistogram({ trades }: { trades: ClosedTrade[] }) {
  if (trades.length < 2) return <EmptyChart />;
  const values = trades.map((trade) => Number(trade.pnl));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bins = 11;
  const size = (max - min || 1) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((value) => {
    counts[Math.min(bins - 1, Math.floor((value - min) / size))]! += 1;
  });
  const peak = Math.max(...counts, 1);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const meanBin = Math.min(bins - 1, Math.max(0, Math.floor((mean - min) / size)));
  return (
    <div>
      <div className="flex h-48 items-end gap-1.5">
        {counts.map((count, index) => {
          const start = min + index * size;
          return (
            <div key={index} className="group relative flex flex-1 flex-col items-center justify-end">
              {index === meanBin && (
                <span className="pointer-events-none absolute -top-0.5 bottom-0 w-px bg-white/40" title={`Mean ${money(mean)}`} />
              )}
              <div
                className={`w-full rounded-t ${start + size / 2 >= 0 ? "bg-brand-500/75" : "bg-bear/75"}`}
                style={{ height: `${Math.max(4, (count / peak) * 180)}px` }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border app-border bg-[var(--app-panel)] px-2 py-1 text-[10px] shadow-lg group-hover:block">
                {count} trades · {money(start)} to {money(start + size)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] app-muted">
        <span>{money(min)}</span>
        <span>Mean {money(mean)}</span>
        <span>{money(max)}</span>
      </div>
    </div>
  );
}

function ExitDonut({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const labels: { key: ClosedTrade["exitReason"]; label: string; color: string }[] = [
    { key: "take-profit", label: "Take profit", color: C.pos },
    { key: "manual", label: "Manual", color: C.blue },
    { key: "session-end", label: "Session end", color: C.amber },
    { key: "stop-loss", label: "Stop loss", color: C.neg },
  ];
  const R = 44;
  const CIRC = 2 * Math.PI * R;
  const GAP = 3; // px surface gap between segments
  let offset = 0;
  const present = labels.filter((item) => trades.some((t) => t.exitReason === item.key));
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[150px_1fr]">
      <div className="relative mx-auto h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90" role="img" aria-label="Exit reason distribution">
          {present.map((item) => {
            const count = trades.filter((t) => t.exitReason === item.key).length;
            const pctVal = count / trades.length;
            const len = Math.max(0, pctVal * CIRC - GAP);
            const node = (
              <circle
                key={item.key}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={item.color}
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={`${len} ${CIRC - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += pctVal * CIRC;
            return node;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-mono text-xl font-bold leading-none">{trades.length}</p>
            <p className="text-[10px] app-muted">trades</p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {labels.map((item) => {
          const count = trades.filter((t) => t.exitReason === item.key).length;
          return (
            <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 app-muted">
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                {item.label}
              </span>
              <strong className="font-mono">{count} · {((count / trades.length) * 100).toFixed(0)}%</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DirectionComparison({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {([["long", "Buy", C.pos], ["short", "Sell", C.neg]] as const).map(([direction, label, color]) => {
        const group = trades.filter((t) => t.direction === direction);
        const wins = group.filter((t) => Number(t.pnl) > 0).length;
        const net = group.reduce((sum, t) => sum + Number(t.pnl), 0);
        const grossWin = group.reduce((sum, t) => sum + Math.max(0, Number(t.pnl)), 0);
        const grossLoss = Math.abs(group.reduce((sum, t) => sum + Math.min(0, Number(t.pnl)), 0));
        const winRate = group.length ? (wins / group.length) * 100 : 0;
        return (
          <div key={direction} className="rounded-xl border app-border bg-[var(--app-panel-2)]/50 p-4">
            <div className="flex items-center justify-between">
              <strong style={{ color }}>{label}</strong>
              <span className="font-mono text-sm font-semibold">{money(net)}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${winRate}%`, background: color }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div><dt className="app-muted">Trades</dt><dd className="mt-1 font-mono font-semibold">{group.length}</dd></div>
              <div><dt className="app-muted">Win rate</dt><dd className="mt-1 font-mono font-semibold">{winRate.toFixed(1)}%</dd></div>
              <div><dt className="app-muted">Average</dt><dd className="mt-1 font-mono font-semibold">{money(group.length ? net / group.length : 0)}</dd></div>
              <div><dt className="app-muted">Profit factor</dt><dd className="mt-1 font-mono font-semibold">{grossLoss ? (grossWin / grossLoss).toFixed(2) : "—"}</dd></div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function StreakChart({ trades, hovered, onHover }: { trades: ClosedTrade[]; hovered: number | null; onHover: (index: number | null) => void }) {
  if (!trades.length) return <EmptyChart />;
  const wins = trades.filter((t) => Number(t.pnl) > 0).length;
  const losses = trades.filter((t) => Number(t.pnl) < 0).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] app-muted">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-500" /> {wins} winners</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-bear" /> {losses} losers</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {trades.map((trade, index) => (
          <button
            key={trade.id}
            type="button"
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
            className={`h-8 min-w-2 flex-1 rounded-sm transition-transform ${Number(trade.pnl) > 0 ? "bg-brand-500" : Number(trade.pnl) < 0 ? "bg-bear" : "bg-slate-500"} ${hovered === index ? "scale-y-125 ring-1 ring-white" : ""}`}
            title={`Trade ${index + 1}: ${money(Number(trade.pnl))}`}
            aria-label={`Trade ${index + 1} ${Number(trade.pnl) >= 0 ? "win" : "loss"} ${money(Number(trade.pnl))}`}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs app-muted">
        <span>First trade</span>
        <span>Latest trade</span>
      </div>
    </div>
  );
}

function CategoryProfitBars({ rows }: { rows: { label: string; value: number; trades: number }[] }) {
  const peak = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <div className="flex h-56 items-end gap-2 sm:gap-3">
      {rows.map((row) => {
        const height = Math.max(4, (Math.abs(row.value) / peak) * 160);
        return (
          <div key={row.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end">
            <span className={`mb-2 hidden whitespace-nowrap font-mono text-[10px] font-semibold sm:block ${row.value >= 0 ? "text-brand-300" : "text-bear"}`}>{money(row.value)}</span>
            <div className="relative flex h-40 w-full items-center justify-center">
              <span
                className={`absolute w-full max-w-14 ${row.value >= 0 ? "bottom-1/2 rounded-t-md bg-brand-500/80" : "top-1/2 rounded-b-md bg-bear/80"}`}
                style={{ height: `${height / 2}px` }}
              />
              <span className="pointer-events-none absolute bottom-full z-10 mb-2 hidden whitespace-nowrap rounded-lg border app-border bg-[var(--app-panel-2)] px-2 py-1 text-[10px] shadow-lg group-hover:block">
                {row.trades} trades · {money(row.value)}
              </span>
            </div>
            <span className="mt-2 truncate text-[10px] font-semibold app-muted sm:text-xs">{row.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function WeekdayProfitChart({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = labels.map((label) => ({ label, value: 0, trades: 0 }));
  trades.forEach((trade) => {
    const row = rows[getNewYorkDateParts(trade.entryTime).weekday]!;
    row.value += Number(trade.pnl);
    row.trades += 1;
  });
  // Drop weekend columns that never trade to reduce clutter.
  return <CategoryProfitBars rows={rows.filter((r) => r.trades > 0 || (r.label !== "Sun" && r.label !== "Sat"))} />;
}

function TradingSessionProfitChart({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const labels = ["Asia", "London", "New York", "Rollover"] as const;
  const rows = labels.map((label) => ({ label, value: 0, trades: 0 }));
  trades.forEach((trade) => {
    const row = rows.find((item) => item.label === getTradingSession(trade.entryTime))!;
    row.value += Number(trade.pnl);
    row.trades += 1;
  });
  return <CategoryProfitBars rows={rows} />;
}

function DurationDistribution({ trades }: { trades: ClosedTrade[] }) {
  if (trades.length < 2) return <EmptyChart />;
  const buckets = [
    { label: "<15m", max: 15 },
    { label: "15–60m", max: 60 },
    { label: "1–4h", max: 240 },
    { label: "4–12h", max: 720 },
    { label: "12h+", max: Infinity },
  ];
  const rows = buckets.map((b) => ({ label: b.label, count: 0, net: 0 }));
  trades.forEach((t) => {
    const minutes = (t.exitTime - t.entryTime) / 60_000;
    const bucket = buckets.findIndex((b) => minutes < b.max);
    const row = rows[bucket === -1 ? rows.length - 1 : bucket]!;
    row.count += 1;
    row.net += Number(t.pnl);
  });
  const peak = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[58px_1fr_84px] items-center gap-3 text-xs">
          <span className="app-muted">{row.label}</span>
          <div className="h-4 overflow-hidden rounded bg-white/[0.05]">
            <div className={`h-full rounded ${row.net >= 0 ? "bg-brand-500/70" : "bg-bear/70"}`} style={{ width: `${Math.max(2, (row.count / peak) * 100)}%` }} />
          </div>
          <strong className={`text-right font-mono ${row.net >= 0 ? "text-brand-300" : "text-bear"}`}>{row.count} · {money(row.net)}</strong>
        </div>
      ))}
    </div>
  );
}

function TimingHeatmap({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ pnl: 0, count: 0 })));
  trades.forEach((t) => {
    const date = getNewYorkDateParts(t.entryTime);
    const cell = cells[date.weekday]![date.hour]!;
    cell.pnl += Number(t.pnl);
    cell.count += 1;
  });
  const max = Math.max(...cells.flat().map((c) => Math.abs(c.pnl)), 1);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[40px_repeat(24,1fr)] gap-1 text-[9px] app-muted">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">{h}</span>
          ))}
          {cells.map((row, day) => (
            <div key={day} className="contents">
              <span className="self-center">{days[day]}</span>
              {row.map((cell, h) => {
                const strength = Math.abs(cell.pnl) / max;
                const bg = cell.count === 0 ? "rgba(148,161,184,0.06)" : cell.pnl >= 0 ? `rgba(34,195,160,${0.18 + strength * 0.72})` : `rgba(244,100,108,${0.18 + strength * 0.72})`;
                return <span key={h} className="h-7 rounded-[3px]" style={{ background: bg }} title={`${days[day]} ${h}:00 New York · ${cell.count} trades · ${money(cell.pnl)}`} />;
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] app-muted">
          <span>Entry time in New York · stronger colour means larger net P/L</span>
          <span className="flex items-center gap-2">
            <i className="h-3 w-6 rounded-sm" style={{ background: "rgba(244,100,108,0.7)" }} /> Loss
            <i className="h-3 w-6 rounded-sm" style={{ background: "rgba(34,195,160,0.7)" }} /> Profit
          </span>
        </div>
      </div>
    </div>
  );
}

function RiskScatter({ trades }: { trades: ClosedTrade[] }) {
  const recorded = trades.filter((t) => Number(t.initialRiskAmount) > 0);
  if (!recorded.length) return <EmptyChart text="MAE/MFE and initial-risk tracking is available for trades opened after the analytics upgrade." />;
  const durations = recorded.map((t) => (t.exitTime - t.entryTime) / 60000);
  const multiples = recorded.map((t) => Number(t.pnl) / Number(t.initialRiskAmount));
  const maxX = Math.max(...durations, 1);
  const minY = Math.min(...multiples, -1);
  const maxY = Math.max(...multiples, 1);
  const spread = maxY - minY || 1;
  const yZero = PAD + (1 - (0 - minY) / spread) * (H - PAD * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Risk reward and duration scatter plot">
        {/* +1R / -1R reference lines */}
        {[1, -1].map((r) => {
          if (r > maxY || r < minY) return null;
          const yy = PAD + (1 - (r - minY) / spread) * (H - PAD * 2);
          return <line key={r} x1={PAD} x2={W - PAD} y1={yy} y2={yy} stroke={r > 0 ? C.pos : C.neg} strokeOpacity="0.28" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />;
        })}
        <line x1={PAD} x2={W - PAD} y1={yZero} y2={yZero} stroke="currentColor" strokeOpacity=".28" />
        {recorded.map((trade, index) => {
          const x = PAD + (durations[index]! / maxX) * (W - PAD * 2);
          const y = PAD + (1 - (multiples[index]! - minY) / spread) * (H - PAD * 2);
          return (
            <circle key={trade.id} cx={x} cy={y} r={Math.max(4, Math.min(11, 3 + Number(trade.lots) * 3))} fill={trade.direction === "long" ? C.pos : C.neg} fillOpacity=".7" stroke="var(--app-panel)" strokeWidth="0.75">
              <title>{`${trade.direction} · ${durationLabel(trade.exitTime - trade.entryTime)} · ${multiples[index]!.toFixed(2)}R · ${money(Number(trade.pnl))}`}</title>
            </circle>
          );
        })}
        <text x={W - 20} y={H - 5} textAnchor="end" fill="currentColor" opacity=".55" fontSize="10">Duration →</text>
        <text x="8" y="14" fill="currentColor" opacity=".55" fontSize="10">R multiple</text>
      </svg>
      <Legend items={[{ label: "Buy", color: C.pos }, { label: "Sell", color: C.neg }]} />
    </div>
  );
}

function ExcursionChart({ trades }: { trades: ClosedTrade[] }) {
  const recorded = trades.filter((t) => t.maxFavorablePnl !== undefined && t.maxAdversePnl !== undefined);
  if (!recorded.length) return <EmptyChart text="MAE/MFE tracking is available for trades opened after the analytics upgrade." />;
  const max = Math.max(...recorded.flatMap((t) => [Math.abs(Number(t.maxFavorablePnl)), Math.abs(Number(t.maxAdversePnl))]), 1);
  return (
    <div className="space-y-2">
      <Legend items={[{ label: "MAE (worst)", color: C.neg }, { label: "MFE (best)", color: C.pos }]} />
      {recorded.slice(-20).map((trade, index) => (
        <div key={trade.id} className="grid grid-cols-[38px_1fr_1fr] items-center gap-1 text-[10px]">
          <span className="font-mono app-muted">#{recorded.length - Math.min(20, recorded.length) + index + 1}</span>
          <div className="flex justify-end">
            <span className="h-2.5 rounded-l bg-bear" style={{ width: `${Math.max(2, (Math.abs(Number(trade.maxAdversePnl)) / max) * 100)}%` }} title={`MAE ${money(Number(trade.maxAdversePnl))}`} />
          </div>
          <div>
            <span className="block h-2.5 rounded-r bg-brand-500" style={{ width: `${Math.max(2, (Math.abs(Number(trade.maxFavorablePnl)) / max) * 100)}%` }} title={`MFE ${money(Number(trade.maxFavorablePnl))}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PeriodBars({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const periods = new Map<string, { value: number; trades: number }>();
  trades.forEach((t) => {
    const key = newYorkMonthKey(t.exitTime);
    const entry = periods.get(key) ?? { value: 0, trades: 0 };
    entry.value += Number(t.pnl);
    entry.trades += 1;
    periods.set(key, entry);
  });
  const rows = [...periods.entries()];
  const max = Math.max(...rows.map(([, v]) => Math.abs(v.value)), 1);
  return (
    <div className="space-y-3">
      {rows.map(([period, v]) => (
        <div key={period} className="grid grid-cols-[70px_1fr_110px] items-center gap-3 text-xs">
          <span className="font-mono app-muted">{period}</span>
          <div className="relative h-3 rounded-full bg-white/[0.05]">
            <span className="absolute left-1/2 top-0 h-3 w-px bg-white/20" />
            <div className={`absolute top-0 h-3 rounded-full ${v.value >= 0 ? "left-1/2 bg-brand-500" : "right-1/2 bg-bear"}`} style={{ width: `${Math.max(2, (Math.abs(v.value) / max) * 50)}%` }} />
          </div>
          <strong className={`text-right font-mono ${v.value >= 0 ? "text-brand-300" : "text-bear"}`}>{money(v.value)}</strong>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Workbench ─────────────────────────── */

export function SessionAnalyticsWorkbench({
  trades,
  equityCurve,
  startingBalance,
  fullAccess = true,
}: {
  trades: ClosedTrade[];
  equityCurve: EquityPoint[];
  startingBalance: string;
  fullAccess?: boolean;
}) {
  const [tab, setTab] = useState<AnalyticsTab>("overview");
  const [filter, setFilter] = useState<TradeFilter>("all");
  const [query, setQuery] = useState("");
  const [hoveredTrade, setHoveredTrade] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      trades.filter(
        (t) =>
          filter === "all" ||
          (filter === "long" && t.direction === "long") ||
          (filter === "short" && t.direction === "short") ||
          (filter === "winners" && Number(t.pnl) > 0) ||
          (filter === "losers" && Number(t.pnl) < 0),
      ),
    [trades, filter],
  );
  const searched = useMemo(
    () => filtered.filter((t) => `${t.id} ${t.direction} ${t.exitReason} ${t.entryPrice} ${t.exitPrice}`.toLowerCase().includes(query.toLowerCase())),
    [filtered, query],
  );

  const start = Number(startingBalance);
  const wins = filtered.filter((t) => Number(t.pnl) > 0);
  const losses = filtered.filter((t) => Number(t.pnl) < 0);
  const net = filtered.reduce((s, t) => s + Number(t.pnl), 0);
  const grossWin = wins.reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
  const expectancy = filtered.length ? net / filtered.length : 0;
  const profitFactor = grossLoss ? (grossWin / grossLoss).toFixed(2) : "—";
  const winRate = filtered.length ? (wins.length / filtered.length) * 100 : null;
  const endingBalance = start + net;
  const returnPct = start ? (net / start) * 100 : 0;
  const avgHoldMs = filtered.length ? filtered.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) / filtered.length : 0;

  let peak = start;
  let maxDd = 0;
  equityCurve.forEach((p) => {
    const e = Number(p.equity);
    peak = Math.max(peak, e);
    maxDd = Math.max(maxDd, peak - e);
  });
  const rr = filtered.filter((t) => Number(t.initialRiskAmount) > 0).map((t) => Number(t.pnl) / Number(t.initialRiskAmount));
  const averageR = rr.length ? rr.reduce((a, b) => a + b, 0) / rr.length : null;

  let currentStreak = 0;
  let streakType = "Flat";
  for (let i = filtered.length - 1; i >= 0; i--) {
    const pnl = Number(filtered[i]!.pnl);
    const type = pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Flat";
    if (i === filtered.length - 1) streakType = type;
    if (type !== streakType) break;
    currentStreak += 1;
  }
  const streakWord =
    streakType === "Win"
      ? currentStreak === 1 ? "win" : "wins"
      : streakType === "Loss"
        ? currentStreak === 1 ? "loss" : "losses"
        : "flat";

  const kpis = [
    { label: "Win rate", value: winRate === null ? "—" : pct(winRate), sub: `${wins.length}W · ${losses.length}L`, tone: "text-brand-300", icon: Target },
    { label: "Profit factor", value: profitFactor, sub: "gross win ÷ gross loss", tone: "", icon: Scale },
    { label: "Expectancy", value: filtered.length ? money(expectancy) : "—", sub: "per trade", tone: expectancy >= 0 ? "text-brand-300" : "text-bear", icon: Activity },
    { label: "Average R", value: averageR === null ? "—" : `${averageR.toFixed(2)}R`, sub: "realised risk multiple", tone: averageR !== null && averageR >= 0 ? "text-brand-300" : "text-bear", icon: Gauge },
    { label: "Max drawdown", value: money(-maxDd), sub: start ? pct((maxDd / start) * 100) + " of start" : "", tone: "text-bear", icon: ShieldAlert },
    { label: "Avg win / loss", value: `${wins.length ? compactMoney(grossWin / wins.length) : "—"} / ${losses.length ? compactMoney(-grossLoss / losses.length) : "—"}`, sub: "average outcome", tone: "", icon: Percent },
    { label: "Best / worst", value: filtered.length ? `${compactMoney(Math.max(...filtered.map((t) => Number(t.pnl))))} / ${compactMoney(Math.min(...filtered.map((t) => Number(t.pnl))))}` : "—", sub: "single-trade extremes", tone: "", icon: BarChart3 },
    { label: "Current streak", value: currentStreak ? `${currentStreak} ${streakWord}` : "—", sub: `avg hold ${filtered.length ? durationLabel(avgHoldMs) : "—"}`, tone: streakType === "Win" ? "text-brand-300" : streakType === "Loss" ? "text-bear" : "", icon: Clock3 },
  ];

  return (
    <div className="mt-7">
      <div className="sticky top-16 z-30 flex flex-col gap-3 rounded-xl border app-border bg-[var(--app-panel)]/95 p-2 shadow-lg backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Analytics views" className="flex overflow-x-auto">
          {([["overview", "Overview"], ["risk", "Risk"], ["timing", "Timing"], ["trades", "Trades"]] as const).map(([id, label]) => {
            const locked = !fullAccess && (id === "risk" || id === "timing");
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                disabled={locked}
                title={locked ? `${label} analytics are included with Pro` : undefined}
                onClick={() => setTab(id)}
                className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${tab === id ? "bg-brand-500 text-surface-950" : "app-muted hover:text-brand-300"} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {locked && <LockKeyhole size={11} className="mr-1 inline" />}
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <Filter size={13} className="ml-2 shrink-0 app-muted" />
          {([["all", "All"], ["long", "Buy"], ["short", "Sell"], ["winners", "Winners"], ["losers", "Losers"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${filter === id ? "border-brand-400/40 bg-brand-400/10 text-brand-300" : "app-border app-muted hover:text-brand-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!fullAccess && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-brand-400/25 bg-brand-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Unlock complete session analytics</p>
            <p className="mt-1 text-xs app-muted">Pro adds risk analysis, MAE/MFE, timing heatmaps, and CSV exports.</p>
          </div>
          <Link href="/account/billing" className="btn-primary shrink-0 px-4 py-2 text-xs">View Pro plans</Link>
        </div>
      )}

      <div className="mt-4">
        <HeroSummary
          net={net}
          returnPct={returnPct}
          points={equityCurve}
          startingBalance={start}
          endingBalance={endingBalance}
          trades={filtered.length}
          winRate={winRate}
          profitFactor={profitFactor}
        />
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtered analytics summary">
        {kpis.map(({ label, value, sub, tone, icon: Icon }) => (
          <article key={label} className="panel relative overflow-hidden p-4 transition-transform hover:-translate-y-0.5">
            <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-brand-400/40" />
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs app-muted">{label}</p>
                <p className={`mt-2 font-mono text-lg font-semibold ${tone}`}>{value}</p>
                {sub && <p className="mt-1 text-[10px] app-muted">{sub}</p>}
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] app-muted"><Icon size={16} /></span>
            </div>
          </article>
        ))}
      </section>

      {tab === "overview" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Equity, balance & drawdown" subtitle="Hover to inspect synchronized account values and trade exits" className="lg:col-span-2">
            <EquityDrawdownChart points={equityCurve} trades={filtered} />
          </ChartCard>
          <ChartCard title="Cumulative trade P/L" subtitle="Running realised profit across every filtered trade" legend={<Legend items={[{ label: net >= 0 ? "Net positive" : "Net negative", color: net >= 0 ? C.pos : C.neg }]} />}>
            <CumulativePnlChart trades={filtered} hovered={hoveredTrade} onHover={setHoveredTrade} />
          </ChartCard>
          <ChartCard title="Rolling win rate" subtitle="Consistency of the edge over a moving window of trades">
            <RollingWinRateChart trades={filtered} />
          </ChartCard>
          <ChartCard title="Profit by day of week" subtitle="Net P/L grouped by entry day in New York">
            <WeekdayProfitChart trades={filtered} />
          </ChartCard>
          <ChartCard title="Profit by trading session" subtitle="Asia, London, New York, and rollover by New York entry time">
            <TradingSessionProfitChart trades={filtered} />
          </ChartCard>
          <ChartCard title="Exit reasons" subtitle="How positions were closed">
            <ExitDonut trades={filtered} />
          </ChartCard>
          <ChartCard title="P/L distribution" subtitle="Frequency of typical wins, losses, and outliers">
            <PnlHistogram trades={filtered} />
          </ChartCard>
          <ChartCard title="Buy vs Sell" subtitle="Direction-level consistency">
            <DirectionComparison trades={filtered} />
          </ChartCard>
          <ChartCard title="Trade sequence" subtitle="Hover a result to synchronize it with cumulative P/L" className="lg:col-span-2">
            <StreakChart trades={filtered} hovered={hoveredTrade} onHover={setHoveredTrade} />
          </ChartCard>
        </div>
      )}

      {tab === "risk" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Drawdown & recovery" subtitle={`Recovery factor ${maxDd ? (net / maxDd).toFixed(2) : "—"} · Maximum drawdown ${money(-maxDd)}`} className="lg:col-span-2">
            <EquityDrawdownChart points={equityCurve} trades={filtered} />
          </ChartCard>
          <ChartCard title="Risk multiple vs duration" subtitle="Dot size represents lots; dashed lines mark ±1R">
            <RiskScatter trades={filtered} />
          </ChartCard>
          <ChartCard title="MAE / MFE by trade" subtitle="Worst and best marked-to-market P/L while each trade was open">
            <ExcursionChart trades={filtered} />
          </ChartCard>
          <ChartCard title="P/L distribution" subtitle="Shape and skew of individual trade outcomes">
            <PnlHistogram trades={filtered} />
          </ChartCard>
          <ChartCard title="Hold-time distribution" subtitle="How long positions stayed open, and the net from each band">
            <DurationDistribution trades={filtered} />
          </ChartCard>
        </div>
      )}

      {tab === "timing" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Entry-time heatmap" subtitle="Day of week × hour in New York" className="lg:col-span-2">
            <TimingHeatmap trades={filtered} />
          </ChartCard>
          <ChartCard title="Monthly performance" subtitle="Net realised P/L by New York exit month">
            <PeriodBars trades={filtered} />
          </ChartCard>
          <ChartCard title="Hold-time distribution" subtitle="Trade count and net P/L by duration band">
            <DurationDistribution trades={filtered} />
          </ChartCard>
          <ChartCard title="Trade duration & R multiple" subtitle="Find whether longer holds improve outcomes" className="lg:col-span-2">
            <RiskScatter trades={filtered} />
          </ChartCard>
        </div>
      )}

      {tab === "trades" && (
        <section className="panel mt-4 overflow-hidden">
          <div className="flex flex-col gap-3 border-b app-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Trade history</h3>
              <p className="mt-1 text-xs app-muted">{searched.length} of {trades.length} trades shown</p>
            </div>
            <label className="flex h-9 items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3">
              <Search size={14} className="app-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 bg-transparent text-xs outline-none" placeholder="Search trade, price, or exit…" aria-label="Search trade history" />
            </label>
          </div>
          <TradesTable trades={searched} />
        </section>
      )}
    </div>
  );
}
