"use client";

import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Gauge,
  History,
  LineChart,
  Pause,
  Play,
  Target,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

import { CandlestickChart } from "@/components/CandlestickChart";
import { Section } from "@/components/Section";

const VIEWS = [
  { id: "replay", label: "Market replay", icon: Play },
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

function WindowChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] bg-surface-900/90 px-4 py-3">
      <span className="flex gap-1.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-bear/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand-400/70" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </span>
      <span className="h-2 w-10 rounded-full bg-white/[0.06]" aria-hidden />
    </div>
  );
}

function ReplayView() {
  return (
    <div className="showcase-enter h-full bg-surface-900/50">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-white/10 bg-surface-800 px-3 py-2 font-mono text-xs font-semibold text-white">
            EUR/USD <ChevronDown size={12} className="ml-1 inline text-slate-500" />
          </span>
          <span className="rounded-md bg-brand-400/15 px-2 py-1 font-mono text-[10px] text-brand-200">
            15m
          </span>
        </div>
        <div className="flex gap-2">
          <span className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-surface-950">
            Buy
          </span>
          <span className="rounded-lg bg-bear px-4 py-2 text-xs font-bold text-white">
            Sell
          </span>
        </div>
      </div>
      <div className="relative p-3">
        <div className="market-reveal">
          <CandlestickChart className="h-64 w-full sm:h-80" />
        </div>
        <span className="absolute left-[11%] right-[8%] top-[42%] border-t border-dashed border-brand-300/50" />
        <span className="absolute right-[7%] top-[calc(42%-10px)] rounded bg-brand-500 px-1.5 py-0.5 font-mono text-[9px] font-bold text-surface-950">
          1.08761
        </span>
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-white/10 bg-surface-950/95 px-3 py-2 shadow-card">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-surface-950">
            <Pause size={13} fill="currentColor" aria-hidden />
          </span>
          <span className="font-mono text-[10px] text-slate-400">Speed</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <span className="replay-progress block h-full rounded-full bg-brand-400" />
          </span>
          <span className="font-mono text-[10px] font-bold text-white">100×</span>
        </div>
      </div>
    </div>
  );
}

function DashboardView() {
  return (
    <div className="showcase-enter h-full bg-surface-900/50 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-300">
            Strategy workspace
          </p>
          <h3 className="mt-1 text-lg font-bold text-white">London Breakout</h3>
        </div>
        <span className="rounded-lg border border-white/10 bg-surface-800 px-3 py-2 text-[10px] text-slate-300">
          Change session <ChevronDown size={12} className="ml-1 inline" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Net P/L", "+$428.60", "text-brand-300"],
          ["Win rate", "62.5%", "text-white"],
          ["Profit factor", "1.84", "text-white"],
          ["Total trades", "24", "text-white"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-white/[0.08] bg-surface-800/70 p-3">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`mt-2 font-mono text-base font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_.8fr]">
        <div className="rounded-xl border border-white/[0.08] bg-surface-800/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Equity curve</span>
            <span className="font-mono text-[10px] text-brand-300">+4.29%</span>
          </div>
          <svg viewBox="0 0 520 150" className="mt-3 h-36 w-full" aria-label="Rising session equity curve">
            <defs>
              <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c3a0" stopOpacity=".28" />
                <stop offset="100%" stopColor="#22c3a0" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[30, 70, 110].map((y) => (
              <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="rgba(255,255,255,.06)" />
            ))}
            <path d="M0 122 C50 118 72 105 110 110 S170 86 215 92 S274 62 318 73 S370 46 414 53 S476 24 520 28 L520 150 L0 150Z" fill="url(#equity-fill)" />
            <path className="equity-line" d="M0 122 C50 118 72 105 110 110 S170 86 215 92 S274 62 318 73 S370 46 414 53 S476 24 520 28" fill="none" stroke="#22c3a0" strokeWidth="3" />
          </svg>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-surface-800/60 p-4">
          <p className="text-xs font-semibold text-white">Recent activity</p>
          <div className="mt-3 space-y-3">
            {[
              ["EUR/USD", "+$86.20", true],
              ["GBP/USD", "-$24.10", false],
              ["XAU/USD", "+$112.40", true],
            ].map(([pair, pnl, win]) => (
              <div key={String(pair)} className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-[10px] text-slate-400">{pair}</span>
                <span className={`font-mono text-[10px] font-bold ${win ? "text-brand-300" : "text-bear"}`}>
                  {pnl}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsView() {
  const bars = [35, 62, 48, 78, 55, 88, 69];
  return (
    <div className="showcase-enter h-full bg-surface-900/50 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Expectancy", value: "$17.86", icon: TrendingUp },
          { label: "Consistency", value: "74 / 100", icon: Target },
          { label: "Avg. duration", value: "2h 18m", icon: History },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-white/[0.08] bg-surface-800/65 p-3">
            <Icon size={14} className="text-brand-300" aria-hidden />
            <p className="mt-3 text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 font-mono text-sm font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-xl border border-white/[0.08] bg-surface-800/65 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Profit by day</span>
            <LineChart size={15} className="text-brand-300" aria-hidden />
          </div>
          <div className="mt-5 flex h-36 items-end justify-between gap-2">
            {bars.map((height, index) => (
              <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span
                  className="analytics-bar w-full max-w-8 rounded-t bg-gradient-to-t from-brand-600 to-brand-300"
                  style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }}
                />
                <span className="text-[8px] text-slate-500">
                  {["M", "T", "W", "T", "F", "S", "S"][index]}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-surface-800/65 p-4">
          <p className="text-xs font-semibold text-white">Execution quality</p>
          <div className="mt-5 space-y-4">
            {[
              ["Plan adherence", 82],
              ["Risk consistency", 76],
              ["Entry precision", 68],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-mono text-white">{value}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <span
                    className="metric-progress block h-full rounded-full bg-brand-400"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-brand-400/20 bg-brand-400/[0.08] p-3">
            <CheckCircle2 size={15} className="shrink-0 text-brand-300" aria-hidden />
            <span className="text-[10px] leading-4 text-slate-300">
              Strongest results during New York session
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductPreview() {
  const [activeView, setActiveView] = useState<ViewId>("replay");

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveView((current) => {
        const index = VIEWS.findIndex((view) => view.id === current);
        return VIEWS[(index + 1) % VIEWS.length]!.id;
      });
    }, 6500);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <Section
      id="product-preview"
      eyebrow="See ForexTestLab in action"
      title="One workflow, from replay to review"
      description="Explore the workspace traders use to practise execution, manage sessions, and understand performance."
      centered
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Product views">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeView === id}
              onClick={() => setActiveView(id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
                activeView === id
                  ? "border-brand-400/45 bg-brand-400/15 text-brand-200 shadow-glow"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white"
              }`}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-8 -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(34,195,160,.13),transparent_67%)] blur-2xl"
          />
          <div className="product-float overflow-hidden rounded-2xl border border-white/10 bg-surface-800/75 shadow-[0_35px_100px_-35px_rgba(0,0,0,.95)] backdrop-blur">
            <WindowChrome title={VIEWS.find((view) => view.id === activeView)?.label ?? ""} />
            <div className="min-h-[370px]">
              {activeView === "replay" && <ReplayView />}
              {activeView === "dashboard" && <DashboardView />}
              {activeView === "analytics" && <AnalyticsView />}
            </div>
          </div>
          <div className="showcase-timeline mt-4 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
            <span key={activeView} className="block h-full bg-brand-400" />
          </div>
        </div>
      </div>
    </Section>
  );
}
