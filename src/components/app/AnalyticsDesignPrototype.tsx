"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  FlaskConical,
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
      {tab === "reports" && <PrototypePlaceholder icon={Sparkles} title="Strategy reports" description="Risk, timing, setup performance, and AI findings live in focused reports instead of competing on one screen." />}
    </div>
  );
}

function PrototypePlaceholder({ icon: Icon, title, description }: { icon: typeof LineChart; title: string; description: string }) {
  return <section className="mt-5 grid min-h-[420px] place-items-center rounded-2xl bg-[var(--app-panel)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><Icon size={22}/></span><h2 className="mt-4 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 app-muted">{description}</p><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">Prototype view</p></div></section>;
}
