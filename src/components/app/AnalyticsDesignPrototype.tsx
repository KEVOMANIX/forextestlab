"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FlaskConical,
  Gauge,
  LineChart,
  NotebookPen,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type PrototypeTab = "overview" | "trades" | "journal" | "reports";

const EQUITY = [
  100000, 100180, 100040, 100390, 100720, 100610, 100960, 101340,
  101120, 101680, 101940, 101760, 102150, 102720, 102490, 102960,
  103310, 103080, 103520, 103910, 103640, 104110, 103940, 104820,
];

const RECENT_TRADES = [
  { pair: "EUR/USD", side: "Buy", setup: "London breakout", result: "+$620.00", r: "+2.1R", time: "Feb 21 · 10:42", positive: true },
  { pair: "GBP/USD", side: "Sell", setup: "Liquidity sweep", result: "−$125.00", r: "−0.5R", time: "Feb 20 · 09:18", positive: false },
  { pair: "EUR/USD", side: "Buy", setup: "Opening range", result: "+$557.00", r: "+1.8R", time: "Feb 14 · 11:05", positive: true },
  { pair: "USD/JPY", side: "Sell", setup: "NY reversal", result: "+$362.00", r: "+1.2R", time: "Feb 13 · 15:24", positive: true },
  { pair: "EUR/USD", side: "Buy", setup: "London breakout", result: "−$1,492.00", r: "−1.0R", time: "Feb 12 · 08:51", positive: false },
];

const CALENDAR = [
  null, null, null, null, null, null, null,
  null, 541, 260, 0, -444, -930, null,
  null, -584, 304, 557, -1492, 362, null,
  null, -71, 522, 620, -125, 0, null,
  null, null, null, null, null, null, null,
];

const MONTHLY_RETURNS = [2.4, -0.8, 3.1, 1.7, -1.2, 4.3, 0.6, 2.8, -0.5, 3.6, 1.1, 2.2];
const DRAWDOWN = [0, -120, -80, -340, -260, -610, -430, -920, -710, -1492, -980, -620, -830, -410, -180, -390, -140, 0];
const WEEKDAY_RESULTS = [
  { label: "Mon", value: 980, trades: 4 },
  { label: "Tue", value: 1440, trades: 5 },
  { label: "Wed", value: 2010, trades: 4 },
  { label: "Thu", value: -360, trades: 3 },
  { label: "Fri", value: 750, trades: 3 },
];
const SESSION_RESULTS = [
  { label: "London open", value: 2940, rate: 74 },
  { label: "New York open", value: 1510, rate: 63 },
  { label: "London close", value: 620, rate: 60 },
  { label: "Asia", value: -250, rate: 40 },
];
const R_DISTRIBUTION = [
  { label: "<−1R", count: 1 },
  { label: "−1R", count: 3 },
  { label: "0R", count: 2 },
  { label: "+1R", count: 6 },
  { label: "+2R", count: 5 },
  { label: ">+2R", count: 2 },
];
const SETUP_RESULTS = [
  { label: "London breakout", value: 3721, trades: 8, winRate: 75 },
  { label: "Opening range", value: 1117, trades: 4, winRate: 75 },
  { label: "Liquidity sweep", value: 342, trades: 4, winRate: 50 },
  { label: "NY reversal", value: -360, trades: 3, winRate: 33 },
];
const PAIR_RESULTS = [
  { label: "EUR/USD", value: 3190, trades: 11, share: 66 },
  { label: "GBP/USD", value: 1094, trades: 5, share: 23 },
  { label: "USD/JPY", value: 536, trades: 3, share: 11 },
];
const HOLDING_RESULTS = [
  { label: "< 1 hour", value: -220, trades: 4 },
  { label: "1–4 hours", value: 3560, trades: 9 },
  { label: "4–8 hours", value: 1120, trades: 4 },
  { label: "> 8 hours", value: 360, trades: 2 },
];

function linePath(values: number[]) {
  const width = 920;
  const height = 280;
  const pad = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const x = (index: number) => pad + index * ((width - pad * 2) / (values.length - 1));
  const y = (value: number) => pad + (1 - (value - min) / spread) * (height - pad * 2);
  return values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
}

function normalizedPath(values: number[], width = 920, height = 220) {
  const pad = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values.map((value, index) => {
    const x = pad + index * ((width - pad * 2) / (values.length - 1));
    const y = pad + (1 - (value - min) / spread) * (height - pad * 2);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function PrototypeBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
      <FlaskConical size={11} aria-hidden /> Design prototype
    </span>
  );
}

export function AnalyticsDesignPrototype() {
  const [tab, setTab] = useState<PrototypeTab>("overview");
  const [range, setRange] = useState("All");
  const path = linePath(EQUITY);

  return (
    <div className="analytics-workspace mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app" className="inline-flex items-center gap-2 text-xs font-semibold app-muted hover:text-[var(--app-text)]">
          <ArrowLeft size={14} aria-hidden /> Dashboard
        </Link>
        <PrototypeBadge />
      </div>

      <header className="mt-5 flex flex-col gap-5 border-b app-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs app-muted">
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-300"><i className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Completed</span>
            <span>EUR/USD</span><span>·</span><span>Jan 9, 2019 – Jan 19, 2024</span>
          </div>
          <h1 className="mt-2 truncate text-2xl font-bold tracking-[-0.025em] sm:text-3xl">London-session breakout</h1>
          <p className="mt-1 text-sm app-muted">Strategy performance report · New York time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted hover:bg-white/[0.05] hover:text-[var(--app-text)]"><Download size={14} /> Export</button>
          <Link href="/app/backtest" className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-xs font-bold text-surface-950 shadow-sm hover:bg-brand-400"><Play size={14} /> Continue replay</Link>
        </div>
      </header>

      <nav className="flex overflow-x-auto border-b app-border" aria-label="Prototype report sections">
        {(["overview", "trades", "journal", "reports"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold capitalize transition-colors ${tab === item ? "border-brand-400 text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"}`}>{item}</button>
        ))}
      </nav>

      {tab === "overview" && (
        <main className="mt-5 space-y-4">
          <section className="overflow-hidden rounded-2xl bg-[var(--app-panel)] shadow-[0_18px_55px_-38px_rgba(0,0,0,0.9)]">
            <div className="grid xl:grid-cols-[minmax(0,1.8fr)_360px]">
              <div className="min-w-0 p-4 sm:p-5 lg:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Account equity</p>
                    <div className="mt-1.5 flex items-end gap-3">
                      <p className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">$104,820.00</p>
                      <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-300"><TrendingUp size={13} /> 4.82%</span>
                    </div>
                  </div>
                  <div className="inline-flex rounded-lg bg-[var(--app-panel-2)] p-1">
                    {["1M", "3M", "1Y", "All"].map((value) => <button key={value} type="button" onClick={() => setRange(value)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${range === value ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted"}`}>{value}</button>)}
                  </div>
                </div>
                <div className="relative mt-5 overflow-hidden rounded-xl bg-[var(--app-panel-2)]/55">
                  <svg viewBox="0 0 920 280" preserveAspectRatio="none" className="h-72 w-full" role="img" aria-label="Prototype account equity curve">
                    <defs><linearGradient id="prototype-equity" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22c3a0" stopOpacity=".22"/><stop offset="1" stopColor="#22c3a0" stopOpacity="0"/></linearGradient><pattern id="prototype-grid" width="115" height="56" patternUnits="userSpaceOnUse"><path d="M115 0H0V56" fill="none" stroke="currentColor" strokeOpacity=".07"/></pattern></defs>
                    <rect width="920" height="280" fill="url(#prototype-grid)" className="app-muted" />
                    <path d={`${path} L904,264 L16,264 Z`} fill="url(#prototype-equity)" />
                    <path d={path} fill="none" stroke="#22c3a0" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="absolute inset-x-4 bottom-3 flex justify-between text-[10px] app-muted"><span>Jan 2019</span><span>Jan 2020</span><span>Jan 2022</span><span>Jan 2024</span></div>
                </div>
              </div>

              <aside className="border-t app-border bg-[var(--app-panel-2)]/38 p-5 xl:border-l xl:border-t-0 xl:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Performance summary</p><p className="mt-2 font-mono text-3xl font-semibold text-brand-300">+$4,820.00</p><p className="mt-1 text-xs app-muted">Net realised P/L</p></div>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-400/10 text-brand-300"><ShieldCheck size={20} /></span>
                </div>
                <dl className="mt-6 divide-y app-border border-y app-border">
                  {[['Win rate','68.4%'],['Profit factor','1.92'],['Expectancy','+$253.68'],['Max drawdown','−$1,492.00'],['Closed trades','19']].map(([label,value]) => <div key={label} className="flex items-center justify-between py-3"><dt className="text-xs app-muted">{label}</dt><dd className="font-mono text-sm font-semibold">{value}</dd></div>)}
                </dl>
                <div className="mt-5 rounded-xl bg-brand-400/[0.07] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-brand-300"><Sparkles size={14} /> Edge forming</div>
                  <p className="mt-2 text-xs leading-5 app-muted">Profitable sample with controlled drawdown. Add 11 trades before treating the result as dependable.</p>
                </div>
              </aside>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border app-border bg-[var(--app-border)] sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Average R", "+0.84R"], ["Payoff ratio", "1.47"], ["Avg hold", "3.2h"],
              ["Best trade", "+$1,240"], ["Worst trade", "−$1,492"], ["Current streak", "3 wins"],
            ].map(([label, value]) => <div key={label} className="bg-[var(--app-panel)] px-4 py-3.5"><p className="text-[10px] font-semibold uppercase tracking-[0.11em] app-muted">{label}</p><p className="mt-1.5 font-mono text-base font-semibold">{value}</p></div>)}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
            <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Consistency</p><h2 className="mt-1 text-lg font-semibold">Trading activity</h2></div><button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold app-muted hover:text-[var(--app-text)]"><CalendarDays size={14}/> February 2025 <ChevronRight size={13}/></button></div>
              <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[9px] app-muted">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day)=><span key={day} className="py-1">{day}</span>)}</div>
              <div className="mt-1 grid grid-cols-7 gap-1.5">
                {CALENDAR.map((value,index)=><div key={index} className={`relative min-h-16 rounded-lg p-2 ${value == null ? "bg-white/[0.015]" : value > 0 ? "bg-brand-400/[0.12]" : value < 0 ? "bg-bear/[0.12]" : "bg-white/[0.035]"}`}><span className="text-[9px] app-muted">{index + 1}</span>{value != null && value !== 0 && <p className={`mt-2 truncate font-mono text-[10px] font-semibold ${value > 0 ? "text-brand-300" : "text-bear"}`}>{value > 0 ? "+" : "−"}${Math.abs(value)}</p>}</div>)}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Execution</p><h2 className="mt-1 text-lg font-semibold">Recent trades</h2></div><button type="button" onClick={() => setTab("trades")} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300">View all <ArrowUpRight size={13}/></button></div>
              <div className="mt-4 divide-y app-border">
                {RECENT_TRADES.map((trade)=><article key={`${trade.time}-${trade.pair}`} className="flex items-center gap-3 py-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${trade.positive ? "bg-brand-400/10 text-brand-300" : "bg-bear/10 text-bear"}`}>{trade.positive ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-xs font-semibold">{trade.pair} · {trade.side}</p><span className="text-[9px] app-muted">{trade.r}</span></div><p className="mt-1 truncate text-[10px] app-muted">{trade.setup} · {trade.time}</p></div><p className={`shrink-0 font-mono text-xs font-semibold ${trade.positive ? "text-brand-300" : "text-bear"}`}>{trade.result}</p></article>)}
              </div>
            </section>
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            {[
              { icon: Target, label: "Best setup", value: "London breakout", detail: "+$3,721 across 8 trades" },
              { icon: LineChart, label: "Best market window", value: "London open", detail: "74% win rate · +$2,940" },
              { icon: CheckCircle2, label: "Rule discipline", value: "82% followed", detail: "Rules-followed trades outperform by 1.3R" },
            ].map(({icon:Icon,label,value,detail})=><article key={label} className="rounded-xl bg-[var(--app-panel)] p-4"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] app-muted"><Icon size={15}/></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">{label}</p><h3 className="mt-1.5 text-sm font-semibold">{value}</h3><p className="mt-1 text-xs app-muted">{detail}</p></div></div></article>)}
          </section>
        </main>
      )}

      {tab === "trades" && <PrototypePlaceholder icon={LineChart} title="Trade explorer" description="This direction uses a dense, sortable trade ledger with a synchronized P/L curve and a slide-over trade review." />}
      {tab === "journal" && <PrototypePlaceholder icon={NotebookPen} title="Trading journal" description="Journal entries, rule adherence, screenshots, setup tags, and emotions are reviewed in one focused timeline." />}
      {tab === "reports" && <ReportsWorkspace />}
    </div>
  );
}

function ReportsWorkspace() {
  const drawdownPath = normalizedPath(DRAWDOWN);

  return (
    <main className="mt-5 space-y-4">
      <section className="flex flex-col gap-4 rounded-2xl bg-[var(--app-panel)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Strategy reports</p>
          <h2 className="mt-1 text-xl font-semibold">Find where the edge comes from</h2>
          <p className="mt-1 text-xs app-muted">All 19 closed trades · Jan 2019 – Jan 2024 · New York time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold app-muted"><CalendarDays size={14} /> Entire test</button>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold app-muted"><BarChart3 size={14} /> Closed trades</button>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border app-border bg-[var(--app-border)] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Return / drawdown", "3.23", "Healthy"],
          ["Recovery time", "18 trades", "From deepest trough"],
          ["Positive months", "9 of 12", "75% consistency"],
          ["Statistical confidence", "Developing", "11 more trades needed"],
        ].map(([label, value, detail]) => (
          <div key={label} className="bg-[var(--app-panel)] px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] app-muted">{label}</p>
            <p className="mt-2 font-mono text-lg font-semibold">{value}</p>
            <p className="mt-1 text-[10px] app-muted">{detail}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.7fr)]">
        <ReportCard eyebrow="Risk profile" title="Drawdown and recovery" icon={TrendingDown}>
          <div className="mt-5 overflow-hidden rounded-xl bg-[var(--app-panel-2)]/55">
            <svg viewBox="0 0 920 220" preserveAspectRatio="none" className="h-60 w-full" role="img" aria-label="Drawdown curve">
              <defs>
                <linearGradient id="drawdown-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fb7185" stopOpacity=".04"/><stop offset="1" stopColor="#fb7185" stopOpacity=".25"/></linearGradient>
                <pattern id="report-grid" width="115" height="55" patternUnits="userSpaceOnUse"><path d="M115 0H0V55" fill="none" stroke="currentColor" strokeOpacity=".07"/></pattern>
              </defs>
              <rect width="920" height="220" fill="url(#report-grid)" className="app-muted" />
              <path d={`${drawdownPath} L904,16 L16,16 Z`} fill="url(#drawdown-fill)" />
              <path d={drawdownPath} fill="none" stroke="#fb7185" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <line x1="16" y1="16" x2="904" y2="16" stroke="currentColor" strokeOpacity=".13" />
            </svg>
          </div>
          <div className="mt-3 flex justify-between text-[10px] app-muted"><span>Trade 1</span><span>Deepest: −$1,492</span><span>Recovered</span><span>Trade 19</span></div>
        </ReportCard>

        <ReportCard eyebrow="Risk diagnosis" title="What the drawdown says" icon={Gauge}>
          <div className="mt-5 rounded-xl border app-border p-4">
            <div className="flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[0.12em] app-muted">Maximum depth</p><p className="mt-1 font-mono text-2xl font-semibold text-bear">−1.49%</p></div><p className="font-mono text-xs app-muted">−$1,492</p></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[38%] rounded-full bg-bear" /></div>
            <p className="mt-2 text-[10px] app-muted">38% of your provisional 4% risk budget</p>
          </div>
          <dl className="mt-4 divide-y app-border">
            {[["Average drawdown", "−$412"], ["Longest recovery", "18 trades"], ["Time below peak", "31%"], ["Open risk", "$0.00"]].map(([label, value]) => <div key={label} className="flex justify-between py-3 text-xs"><dt className="app-muted">{label}</dt><dd className="font-mono font-semibold">{value}</dd></div>)}
          </dl>
        </ReportCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
        <ReportCard eyebrow="Consistency" title="Monthly returns" icon={BarChart3}>
          <div className="mt-6 grid h-56 grid-cols-12 items-center gap-2 border-b app-border px-1">
            {MONTHLY_RETURNS.map((value, index) => {
              const height = Math.max(12, Math.abs(value) / 4.3 * 86);
              return (
                <div key={index} className="flex h-full flex-col items-center justify-center">
                  <div className="flex h-[172px] w-full flex-col justify-center">
                    <div className="relative h-1/2 border-b border-white/10">
                      {value > 0 && <div className="absolute bottom-0 left-1/2 w-[72%] -translate-x-1/2 rounded-t bg-brand-400/80" style={{ height: `${height}%` }} />}
                    </div>
                    <div className="relative h-1/2">
                      {value < 0 && <div className="absolute left-1/2 top-0 w-[72%] -translate-x-1/2 rounded-b bg-bear/80" style={{ height: `${height}%` }} />}
                    </div>
                  </div>
                  <span className="mt-2 text-[9px] app-muted">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][index]}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs"><span className="app-muted">Best month <b className="ml-1 font-mono text-brand-300">+4.3%</b></span><span className="app-muted">Worst month <b className="ml-1 font-mono text-bear">−1.2%</b></span><span className="app-muted">Average <b className="ml-1 font-mono text-[var(--app-text)]">+1.61%</b></span></div>
        </ReportCard>

        <ReportCard eyebrow="Market timing" title="Performance by session" icon={Clock3}>
          <div className="mt-5 space-y-5">
            {SESSION_RESULTS.map((session) => (
              <div key={session.label}>
                <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{session.label}</span><span className={`font-mono font-semibold ${session.value >= 0 ? "text-brand-300" : "text-bear"}`}>{session.value >= 0 ? "+" : "−"}${Math.abs(session.value).toLocaleString()}</span></div>
                <div className="mt-2 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${session.value >= 0 ? "bg-brand-400" : "bg-bear"}`} style={{ width: `${Math.max(12, Math.abs(session.value) / 2940 * 100)}%` }} /></div><span className="w-8 text-right font-mono text-[9px] app-muted">{session.rate}%</span></div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-brand-400/[0.07] p-3 text-xs leading-5 app-muted"><b className="text-brand-300">London open</b> produces 61% of net profit with the strongest win rate.</div>
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard eyebrow="Timing" title="Performance by weekday" icon={CalendarDays}>
          <div className="mt-5 space-y-4">
            {WEEKDAY_RESULTS.map((day) => (
              <div key={day.label} className="grid grid-cols-[34px_minmax(0,1fr)_72px] items-center gap-3 text-xs">
                <span className="font-semibold">{day.label}</span>
                <div className="h-7 overflow-hidden rounded-md bg-white/[0.035]"><div className={`flex h-full items-center rounded-md px-2 ${day.value >= 0 ? "bg-brand-400/15" : "bg-bear/15"}`} style={{ width: `${Math.max(18, Math.abs(day.value) / 2010 * 100)}%` }}><span className="text-[9px] app-muted">{day.trades} trades</span></div></div>
                <span className={`text-right font-mono font-semibold ${day.value >= 0 ? "text-brand-300" : "text-bear"}`}>{day.value >= 0 ? "+" : "−"}${Math.abs(day.value)}</span>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard eyebrow="Trade outcomes" title="R-multiple distribution" icon={Target}>
          <div className="mt-6 grid h-44 grid-cols-6 items-end gap-3 border-b app-border px-2">
            {R_DISTRIBUTION.map((bucket) => <div key={bucket.label} className="flex h-full flex-col justify-end text-center"><span className="mb-2 font-mono text-[10px] app-muted">{bucket.count}</span><div className={`mx-auto w-[72%] rounded-t ${bucket.label.startsWith("+") || bucket.label.startsWith(">") ? "bg-brand-400/75" : bucket.label === "0R" ? "bg-white/20" : "bg-bear/75"}`} style={{ height: `${bucket.count / 6 * 80}%` }} /><span className="mt-2 pb-2 text-[9px] app-muted">{bucket.label}</span></div>)}
          </div>
          <p className="mt-4 text-xs leading-5 app-muted">The distribution is positively skewed: <b className="text-[var(--app-text)]">7 trades closed above +1R</b>, while losses remain concentrated near −1R.</p>
        </ReportCard>
      </div>
      <section className="pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Edge breakdowns</p>
        <h2 className="mt-1 text-xl font-semibold">Understand what is driving the result</h2>
        <p className="mt-1 text-xs app-muted">Compare repeatable sources of profit and identify weak conditions to remove from the plan.</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <ReportCard eyebrow="Strategy execution" title="Performance by setup" icon={Target}>
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[580px] divide-y app-border">
              <div className="grid grid-cols-[minmax(170px,1fr)_72px_90px_90px] gap-4 pb-2 text-[9px] font-semibold uppercase tracking-[0.1em] app-muted"><span>Setup</span><span>Trades</span><span>Win rate</span><span className="text-right">Net P/L</span></div>
              {SETUP_RESULTS.map((setup) => (
                <div key={setup.label} className="grid grid-cols-[minmax(170px,1fr)_72px_90px_90px] items-center gap-4 py-3 text-xs">
                  <div><p className="font-semibold">{setup.label}</p><div className="mt-2 h-1 w-full max-w-48 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${setup.value >= 0 ? "bg-brand-400" : "bg-bear"}`} style={{ width: `${Math.max(10, Math.abs(setup.value) / 3721 * 100)}%` }} /></div></div>
                  <span className="font-mono app-muted">{setup.trades}</span>
                  <span className="font-mono">{setup.winRate}%</span>
                  <span className={`text-right font-mono font-semibold ${setup.value >= 0 ? "text-brand-300" : "text-bear"}`}>{setup.value >= 0 ? "+" : "−"}${Math.abs(setup.value).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </ReportCard>

        <ReportCard eyebrow="Market selection" title="Performance by pair" icon={BarChart3}>
          <div className="mt-5 space-y-5">
            {PAIR_RESULTS.map((pair) => (
              <div key={pair.label}>
                <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold">{pair.label}</p><p className="mt-1 text-[9px] app-muted">{pair.trades} trades · {pair.share}% of profit</p></div><p className="font-mono text-xs font-semibold text-brand-300">+${pair.value.toLocaleString()}</p></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-brand-400" style={{ width: `${pair.share}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-6 rounded-xl bg-amber-300/[0.06] p-3 text-xs leading-5 app-muted"><b className="text-amber-200">Concentration note:</b> EUR/USD generates two thirds of profit. Validate the edge on more pairs before scaling.</p>
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard eyebrow="Direction" title="Long versus short" icon={TrendingUp}>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-400/[0.07] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">Long</p><p className="mt-2 font-mono text-xl font-semibold text-brand-300">+$3,420</p><p className="mt-1 text-[10px] app-muted">11 trades · 73% won</p></div>
            <div className="rounded-xl bg-white/[0.025] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">Short</p><p className="mt-2 font-mono text-xl font-semibold">+$1,400</p><p className="mt-1 text-[10px] app-muted">8 trades · 63% won</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 app-muted">Long entries contribute <b className="text-[var(--app-text)]">71% of net profit</b>, but both directions remain profitable.</p>
        </ReportCard>

        <ReportCard eyebrow="Trade management" title="Performance by holding time" icon={Clock3}>
          <div className="mt-5 space-y-3">
            {HOLDING_RESULTS.map((bucket) => (
              <div key={bucket.label} className="grid grid-cols-[76px_minmax(0,1fr)_72px] items-center gap-2 text-[10px]">
                <span className="app-muted">{bucket.label}</span>
                <div className="h-5 overflow-hidden rounded bg-white/[0.035]"><div className={`h-full rounded ${bucket.value >= 0 ? "bg-brand-400/20" : "bg-bear/20"}`} style={{ width: `${Math.max(12, Math.abs(bucket.value) / 3560 * 100)}%` }} /></div>
                <span className={`text-right font-mono font-semibold ${bucket.value >= 0 ? "text-brand-300" : "text-bear"}`}>{bucket.value >= 0 ? "+" : "−"}${Math.abs(bucket.value)}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 app-muted">Your strongest trades resolve within <b className="text-[var(--app-text)]">one to four hours</b>. Very fast exits are currently unprofitable.</p>
        </ReportCard>

        <ReportCard eyebrow="Robustness" title="Profit concentration" icon={ShieldCheck}>
          <div className="mt-5 flex items-center gap-5">
            <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(#22c3a0 0 44%, rgba(255,255,255,.08) 44% 100%)" }}><div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[var(--app-panel)]"><div className="text-center"><p className="font-mono text-lg font-semibold">44%</p><p className="text-[8px] app-muted">top 3</p></div></div></div>
            <div><p className="text-xs font-semibold">Not dependent on one trade</p><p className="mt-2 text-xs leading-5 app-muted">The three largest winners produce 44% of profit. Removing the best trade leaves the strategy profitable.</p></div>
          </div>
          <dl className="mt-4 divide-y app-border"><div className="flex justify-between py-2.5 text-xs"><dt className="app-muted">P/L without best trade</dt><dd className="font-mono font-semibold text-brand-300">+$3,580</dd></div><div className="flex justify-between py-2.5 text-xs"><dt className="app-muted">Largest trade contribution</dt><dd className="font-mono font-semibold">25.7%</dd></div></dl>
        </ReportCard>
      </div>
    </main>
  );
}

function ReportCard({ eyebrow, title, icon: Icon, children }: { eyebrow: string; title: string; icon: typeof LineChart; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">{eyebrow}</p><h3 className="mt-1 text-lg font-semibold">{title}</h3></div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] app-muted"><Icon size={16} /></span>
      </div>
      {children}
    </section>
  );
}

function PrototypePlaceholder({ icon: Icon, title, description }: { icon: typeof LineChart; title: string; description: string }) {
  return <section className="mt-5 grid min-h-[420px] place-items-center rounded-2xl bg-[var(--app-panel)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><Icon size={22}/></span><h2 className="mt-4 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 app-muted">{description}</p><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">Prototype view</p></div></section>;
}
