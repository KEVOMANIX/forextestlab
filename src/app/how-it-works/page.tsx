import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, CandlestickChart, NotebookPen, Play } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Learn how to create, replay, journal, and review a ForexTestLab backtesting session.",
  alternates: { canonical: "/how-it-works" },
};

const STAGE_NAV = [
  ["Set up", "#setup"],
  ["Replay", "#replay"],
  ["Journal", "#journal"],
  ["Review", "#review"],
  ["Continue", "#continue"],
] as const;

const OVERVIEW = [
  ["01", "Define", "Choose the market and testing period."],
  ["02", "Execute", "Replay and place simulated trades."],
  ["03", "Document", "Record the thinking behind each trade."],
  ["04", "Evaluate", "Review results and update the process."],
] as const;

function Screenshot({ src, alt, width, height, priority = false }: { src: string; alt: string; width: number; height: number; priority?: boolean }) {
  return <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-900 p-1.5 shadow-[0_28px_70px_-42px_rgba(0,0,0,.95)]"><Image src={src} alt={alt} width={width} height={height} priority={priority} className="h-auto w-full rounded-lg" sizes="(max-width:1024px) 100vw, 58vw" /></div>;
}

function Points({ items }: { items: readonly string[] }) {
  return <ul className="mt-6 space-y-3">{items.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-300"><Check size={16} className="mt-1 shrink-0 text-brand-300" aria-hidden />{item}</li>)}</ul>;
}

export default function HowItWorksPage() {
  return (
    <PageShell>
      <header className="border-b border-white/10 py-10 sm:py-12">
        <div className="container-page">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Product workflow</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">How it works</h1>
            <p className="max-w-2xl text-base leading-7 text-slate-400 lg:justify-self-end">A backtest moves through four connected stages: define the test, execute without hindsight, document the decisions, and evaluate the evidence.</p>
          </div>
        </div>
      </header>

      <nav className="sticky top-16 z-30 border-b border-white/10 bg-surface-950/95 backdrop-blur" aria-label="Workflow stages">
        <div className="container-page scroll-x-thin flex gap-1 py-2">{STAGE_NAV.map(([label, href]) => <a key={href} href={href} className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white">{label}</a>)}</div>
      </nav>

      <section className="py-10 sm:py-14">
        <div className="container-page">
          <Screenshot src="/product/replay-desk-20260909.webp" alt="ForexTestLab replay workspace" width={1911} height={826} priority />
          <ol className="mt-6 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {OVERVIEW.map(([number, title, text]) => <li key={number} className="bg-surface-950 p-4"><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-brand-300">{number}</span><h2 className="text-sm font-semibold text-white">{title}</h2></div><p className="mt-2 text-xs leading-5 text-slate-400">{text}</p></li>)}
          </ol>
        </div>
      </section>

      <div className="border-t border-white/10">
        <section id="setup" className="scroll-mt-32 py-16 sm:py-20">
          <div className="container-page grid items-center gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-16"><div><span className="font-mono text-sm font-semibold text-brand-300">01</span><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Set up the test</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Give the session a clear scope.</h2><p className="mt-4 text-base leading-7 text-slate-400">Select the market, historical starting point, replay length, simulated balance, and whether the session follows prop-firm rules.</p><Points items={["Choose one or several available markets", "Use a preset period or custom date range", "Name and tag the strategy before replay begins"]} /></div><Screenshot src="/product/session-dashboard-20260814.webp" alt="ForexTestLab session setup and dashboard" width={1600} height={940} /></div>
        </section>

        <section id="replay" className="scroll-mt-32 border-y border-white/10 bg-surface-900/30 py-16 sm:py-20">
          <div className="container-page grid items-center gap-10 lg:grid-cols-[1.18fr_.82fr] lg:gap-16"><Screenshot src="/product/market-replay-20260814-v2.webp" alt="ForexTestLab historical replay" width={1786} height={880} /><div><CandlestickChart size={20} className="text-brand-300" aria-hidden /><span className="mt-4 block font-mono text-sm font-semibold text-brand-300">02</span><p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Replay and execute</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Make decisions before the outcome is known.</h2><p className="mt-4 text-base leading-7 text-slate-400">Advance the replay at your pace, inspect synchronized chart context, and place simulated orders using the plan you defined.</p><Points items={["Pause or advance candle by candle", "Use drawing and position-planning tools", "Manage entries, stops, targets, and exits"]} /></div></div>
        </section>

        <section id="journal" className="scroll-mt-32 py-16 sm:py-20">
          <div className="container-page grid items-center gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-16"><div><NotebookPen size={20} className="text-brand-300" aria-hidden /><span className="mt-4 block font-mono text-sm font-semibold text-brand-300">03</span><p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Document the decision</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Capture what the numbers cannot explain.</h2><p className="mt-4 text-base leading-7 text-slate-400">Journal the setup while the reasoning is fresh, then add the lesson after the position closes.</p><Points items={["Record setup quality, confidence, and emotion", "Attach before-entry and after-exit views", "Separate experimental trades from strategy analytics"]} /></div><Screenshot src="/product/session-analytics.webp" alt="ForexTestLab trade journal and review" width={1600} height={940} /></div>
        </section>

        <section id="review" className="scroll-mt-32 border-y border-white/10 bg-surface-900/30 py-16 sm:py-20">
          <div className="container-page grid items-center gap-10 lg:grid-cols-[1.18fr_.82fr] lg:gap-16"><Screenshot src="/product/session-analytics-20260814.webp" alt="ForexTestLab analytics report" width={1600} height={940} /><div><BarChart3 size={20} className="text-brand-300" aria-hidden /><span className="mt-4 block font-mono text-sm font-semibold text-brand-300">04</span><p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Evaluate the evidence</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Turn the session into a specific next step.</h2><p className="mt-4 text-base leading-7 text-slate-400">Review performance patterns, reopen individual trades on the chart, and compare the result with the process recorded in the journal.</p><Points items={["Measure return, expectancy, and drawdown", "Inspect timing, session, direction, and streak patterns", "Translate recurring mistakes into the next test rule"]} /></div></div>
        </section>

        <section id="continue" className="scroll-mt-32 py-16 sm:py-20">
          <div className="container-page grid items-center gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-16"><div><Play size={20} className="text-brand-300" aria-hidden /><p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Continue later</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Resume from the state you saved.</h2><p className="mt-4 text-base leading-7 text-slate-400">The dashboard remembers the selected session and restores its replay progress, trades, drawings, layout, and loaded market history.</p><Link href="/features#sessions" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">View saved-session features <ArrowRight size={15} aria-hidden /></Link></div><Screenshot src="/product/session-dashboard-20260814.webp" alt="ForexTestLab saved sessions" width={1600} height={940} /></div>
        </section>
      </div>

      <section className="border-t border-white/10 py-14"><div className="container-page flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><h2 className="text-xl font-semibold text-white">Run the workflow yourself.</h2><p className="mt-1 text-sm text-slate-400">Create a historical replay and save the complete testing record.</p></div><Link href={TRIAL_SIGN_UP_PATH} className="btn-primary shrink-0">Start a session <ArrowRight size={16} aria-hidden /></Link></div></section>
    </PageShell>
  );
}
