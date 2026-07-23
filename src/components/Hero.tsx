import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Play,
  Sparkles,
  TrendingUp,
  UserPlus,
} from "lucide-react";

import { CandlestickChart } from "@/components/CandlestickChart";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32">
      {/* Ambient background: faint grid + radial brand glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint [background-size:44px_44px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-radial-brand"
      />

      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow animate-fade-up">
            <Sparkles size={14} aria-hidden />
            Your forex strategy testing workspace
          </p>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight text-white animate-fade-up sm:text-5xl lg:text-6xl">
            Test Your Forex Strategy Before Risking Real Capital
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 animate-fade-up sm:text-lg">
            Replay historical price action without future-data leakage, place
            simulated trades, and turn every testing session into measurable
            performance insights.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 animate-fade-up sm:flex-row">
            <Link href={TRIAL_SIGN_UP_PATH} className="btn-primary w-full shadow-glow sm:w-auto">
              <UserPlus size={16} aria-hidden />
              Start free trial
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/app" className="btn-secondary w-full sm:w-auto">
              <BarChart3 size={16} aria-hidden />
              Open dashboard
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Three one-month trial sessions per device. No payment required.
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl animate-fade-up">
          <div
            aria-hidden="true"
            className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand-400/[0.08] blur-3xl"
          />
          <div className="product-float overflow-hidden rounded-2xl border border-white/10 bg-surface-800/80 p-2 shadow-[0_35px_100px_-35px_rgba(0,0,0,.95)] backdrop-blur">
            <div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-surface-900/80 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-bear/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-bull/70" />
                </span>
                <span className="font-mono text-sm font-medium text-white">
                  EUR/USD
                </span>
                <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-xs text-slate-400">
                  15m
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-400/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300" />
                Replay mode
              </span>
            </div>
            <div className="relative overflow-hidden bg-surface-900/40 p-2">
              <div className="market-reveal">
                <CandlestickChart className="h-64 w-full sm:h-80" />
              </div>
              <div className="chart-scan absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-brand-300/75 to-transparent" />
              <div className="absolute left-[58%] top-[28%] hidden items-center gap-2 rounded-lg border border-brand-400/25 bg-surface-900/90 px-3 py-2 shadow-card sm:flex">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-400/15 text-brand-300">
                  <TrendingUp size={14} aria-hidden />
                </span>
                <span>
                  <span className="block text-[9px] uppercase tracking-[0.13em] text-slate-500">
                    Open position
                  </span>
                  <span className="font-mono text-xs font-semibold text-brand-200">
                    Buy 0.50 · 1.08642
                  </span>
                </span>
              </div>
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-white/10 bg-surface-950/90 px-3 py-2 shadow-card backdrop-blur">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-surface-950">
                  <Play size={14} fill="currentColor" aria-hidden />
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-[9px] uppercase tracking-[0.13em] text-slate-500">
                    Market replay
                  </span>
                  <span className="block text-xs font-semibold text-white">
                    15 minute steps
                  </span>
                </span>
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10 sm:w-28">
                  <span className="replay-progress block h-full rounded-full bg-brand-400" />
                </span>
              </div>
            </div>
          </div>
          <div className="product-float-delayed absolute -bottom-5 -right-2 hidden items-center gap-3 rounded-xl border border-white/10 bg-surface-800/95 px-4 py-3 shadow-card backdrop-blur sm:flex lg:-right-10">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-400/15 text-brand-300">
              <CheckCircle2 size={17} aria-hidden />
            </span>
            <span>
              <span className="block text-[10px] uppercase tracking-[0.13em] text-slate-500">
                Trade recorded
              </span>
              <span className="block text-sm font-semibold text-white">
                Session analytics updated
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
