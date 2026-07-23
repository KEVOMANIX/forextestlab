import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

const PROOF_POINTS = [
  { icon: Play, label: "Historical market replay" },
  { icon: Clock3, label: "New York market time" },
  { icon: ShieldCheck, label: "Sessions saved automatically" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-24 sm:pt-28 lg:pb-24 lg:pt-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-grid-faint [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-0 -z-10 h-[34rem] w-[34rem] rounded-full bg-brand-400/[0.08] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-48 top-40 -z-10 h-[36rem] w-[36rem] rounded-full bg-accent-500/[0.07] blur-[130px]"
      />

      <div className="mx-auto grid w-full max-w-[1440px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(360px,.72fr)_minmax(0,1.28fr)] lg:gap-10 xl:gap-16">
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow animate-fade-up">
            <Sparkles size={13} aria-hidden />
            Built for deliberate practice
          </p>
          <h1 className="mt-6 text-balance text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white animate-fade-up sm:text-6xl lg:text-[4.4rem]">
            Replay the market. Test the decision.{" "}
            <span className="text-brand-300">Know the numbers.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-slate-300 animate-fade-up sm:text-lg">
            Practise your forex strategy on historical price action, execute
            simulated trades, and review every session with structured analytics.
          </p>

          <div className="mt-8 flex flex-col gap-3 animate-fade-up sm:flex-row">
            <Link
              href={TRIAL_SIGN_UP_PATH}
              className="btn-primary min-h-12 w-full px-6 shadow-glow sm:w-auto"
            >
              Start free trial
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link
              href="#product-preview"
              className="btn-secondary min-h-12 w-full px-6 sm:w-auto"
            >
              <BarChart3 size={16} aria-hidden />
              See the workspace
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Check size={13} className="text-brand-300" aria-hidden />
            Three one-month trial sessions. No payment required.
          </p>

          <div className="mt-9 grid gap-3 border-t border-white/[0.08] pt-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {PROOF_POINTS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 text-xs text-slate-400">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand-400/20 bg-brand-400/[0.07] text-brand-300">
                  <Icon size={14} aria-hidden />
                </span>
                <span className="leading-4">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-w-0 lg:-mr-24 xl:-mr-32">
          <div
            aria-hidden
            className="absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_50%_50%,rgba(34,195,160,.16),transparent_67%)] blur-2xl"
          />
          <div className="real-product-screen overflow-hidden rounded-2xl border border-white/[0.12] bg-surface-800/90 p-1.5 shadow-[0_45px_140px_-45px_rgba(0,0,0,.95)]">
            <div className="flex h-9 items-center justify-between rounded-t-xl border-b border-white/[0.08] bg-surface-900/90 px-3">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2 w-2 rounded-full bg-bear/80" />
                <span className="h-2 w-2 rounded-full bg-amber-400/80" />
                <span className="h-2 w-2 rounded-full bg-brand-400/80" />
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                ForexTestLab · Market replay
              </span>
              <span className="flex items-center gap-1.5 text-[9px] font-medium text-brand-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300" />
                Session active
              </span>
            </div>
            <div className="relative overflow-hidden rounded-b-xl">
              <Image
                src="/product/market-replay.webp"
                alt="ForexTestLab historical market replay workspace with a live candlestick chart and trading controls"
                width={1600}
                height={940}
                priority
                sizes="(max-width: 1024px) 100vw, 68vw"
                className="h-auto w-full"
              />
              <div
                aria-hidden
                className="product-screen-sheen absolute inset-y-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.035] to-transparent"
              />
            </div>
          </div>

          <div className="absolute -bottom-5 left-6 hidden items-center gap-3 rounded-xl border border-white/10 bg-surface-800/95 px-4 py-3 shadow-card backdrop-blur sm:flex">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-400/12 text-brand-300">
              <BarChart3 size={17} aria-hidden />
            </span>
            <span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Real product view
              </span>
              <span className="block text-xs font-semibold text-white">
                Replay, execution, and analytics
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
