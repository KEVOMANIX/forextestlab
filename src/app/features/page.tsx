import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, LayoutDashboard, Play } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore ForexTestLab market replay, simulated execution, journaling, analytics, and strategy-review tools.",
  alternates: { canonical: "/features" },
};

const REPLAY_FEATURES = [
  "Reveal historical candles without exposing future price action",
  "Synchronize several chart layouts and timeframes",
  "Place market and pending orders with stop and target levels",
  "Save drawings, loaded history, trades, and replay progress",
] as const;

const REVIEW_FEATURES = [
  "Equity, drawdown, expectancy, win rate, and profit factor",
  "Trade journal with tags, screenshots, confidence, and lessons",
  "Interactive chart review at the original entry and exit",
  "Timing, session, direction, streak, and execution analysis",
] as const;

function ProductFrame({
  src,
  alt,
  width,
  height,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-900 p-1.5 shadow-[0_30px_80px_-42px_rgba(0,0,0,.95)]">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-full rounded-lg"
        sizes="(max-width: 1024px) 100vw, 70vw"
      />
    </div>
  );
}

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-7 space-y-3.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-slate-300">
          <Check size={17} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function FeaturesPage() {
  return (
    <PageShell>
      <section className="overflow-hidden border-b border-white/10 pt-12 sm:pt-16 lg:pt-20">
        <div className="container-page">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Inside the workspace</p>
            <h1 className="mt-4 text-balance text-4xl font-bold leading-[1.03] tracking-[-0.045em] text-white sm:text-6xl">
              Backtest the decision, not only the outcome.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              Replay, execution, journaling, and analysis remain connected to one historical session.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={TRIAL_SIGN_UP_PATH} className="btn-primary">Start free trial <ArrowRight size={16} aria-hidden /></Link>
              <Link href="/how-it-works" className="btn-secondary">See the workflow</Link>
            </div>
          </div>
          <div className="relative mx-auto mt-12 max-w-6xl translate-y-px sm:mt-14">
            <div aria-hidden className="absolute inset-x-20 bottom-0 h-40 bg-brand-400/10 blur-[90px]" />
            <div className="relative">
              <ProductFrame src="/product/replay-desk-20260909.webp" alt="ForexTestLab multi-chart historical replay workspace" width={1911} height={826} priority />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr] lg:gap-16">
          <ProductFrame src="/product/market-replay-20260814-v2.webp" alt="ForexTestLab replay controls and synchronized charts" width={1786} height={880} />
          <div>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-surface-900 text-brand-300"><Play size={18} aria-hidden /></span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Replay and execution</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Trade only what was visible.</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">Control the pace, change chart context, and execute a complete simulated trade without leaving the workspace.</p>
            <FeatureList items={REPLAY_FEATURES} />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-surface-900/35 py-16 sm:py-24">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-16">
          <div>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-surface-950 text-brand-300"><LayoutDashboard size={18} aria-hidden /></span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Saved sessions</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Return to the same test, not a blank chart.</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">Your dashboard keeps active and completed sessions organized with replay progress and performance visible before you reopen them.</p>
            <Link href="/how-it-works" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">Follow the full workflow <ArrowRight size={15} aria-hidden /></Link>
          </div>
          <ProductFrame src="/product/session-dashboard-20260814.webp" alt="ForexTestLab saved session dashboard" width={1600} height={940} />
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr] lg:gap-16">
          <ProductFrame src="/product/session-analytics-20260814.webp" alt="ForexTestLab session analytics report" width={1600} height={940} />
          <div>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-surface-900 text-brand-300"><BarChart3 size={18} aria-hidden /></span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Journal and analytics</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Connect the result back to the trade.</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">Measure the session, then reopen the decisions behind those numbers with their notes and market context.</p>
            <FeatureList items={REVIEW_FEATURES} />
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 py-14">
        <div className="container-page flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div><h2 className="text-xl font-semibold text-white">Ready to build a test you can review?</h2><p className="mt-1 text-sm text-slate-400">Start with historical EUR/USD data and a saved replay session.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row"><Link href="/pricing" className="btn-secondary">View pricing</Link><Link href={TRIAL_SIGN_UP_PATH} className="btn-primary">Start free trial</Link></div>
        </div>
      </section>
    </PageShell>
  );
}
