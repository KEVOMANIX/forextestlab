import Link from "next/link";
import { ArrowRight, BarChart3, Sparkles, UserPlus } from "lucide-react";

import { CandlestickChart } from "@/components/CandlestickChart";

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
            <Link href="/sign-up" className="btn-primary w-full shadow-glow sm:w-auto">
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

        {/* Chart-interface mock-up */}
        <div className="relative mx-auto mt-16 max-w-4xl animate-fade-up">
          <div className="rounded-2xl border border-white/10 bg-surface-800/70 p-3 shadow-card backdrop-blur">
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
                  H1
                </span>
              </div>
              <span className="rounded-full border border-brand-400/30 bg-brand-400/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-200">
                Replay mode
              </span>
            </div>
            <div className="bg-surface-900/40 p-2">
              <CandlestickChart className="h-56 w-full sm:h-64" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
