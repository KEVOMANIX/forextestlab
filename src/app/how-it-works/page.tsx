import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, CandlestickChart, NotebookPen, Play } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export const metadata: Metadata = { title: "How It Works", description: "Learn how to create, replay, journal, and review a ForexTestLab backtesting session.", alternates: { canonical: "/how-it-works" } };

const STEPS = [
  { icon: Play, title: "Set the test", text: "Choose a market, historical start, replay length, account balance, and optional prop-firm rules.", result: "A saved session with a defined scope" },
  { icon: CandlestickChart, title: "Replay and execute", text: "Advance at your own pace, switch chart context, draw analysis, and place simulated orders.", result: "Decisions made without future candles" },
  { icon: NotebookPen, title: "Capture the reasoning", text: "Record the setup, confidence, screenshots, mistakes, and the lesson you want to carry forward.", result: "A journal tied to each trade" },
  { icon: BarChart3, title: "Review the evidence", text: "Read the session report, isolate patterns, and reopen any trade at its original market context.", result: "Specific changes for the next test" },
] as const;

export default function HowItWorksPage() {
  return (
    <PageShell>
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="container-page">
          <div className="grid items-end gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">The testing loop</p><h1 className="mt-4 text-balance text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">One session, from first candle to final review.</h1><p className="mt-5 text-base leading-7 text-slate-400">A repeatable process for turning a strategy idea into decisions you can inspect.</p><Link href={TRIAL_SIGN_UP_PATH} className="btn-primary mt-7">Start a session <ArrowRight size={16} /></Link></div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-900 p-1.5"><Image src="/product/replay-desk-20260909.webp" alt="ForexTestLab replay desk" width={1600} height={940} priority className="h-auto w-full rounded-lg" /></div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-surface-900/30 py-16 sm:py-20">
        <div className="container-page grid gap-12 lg:grid-cols-[.62fr_1.38fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Four stages</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">A workflow built for repetition.</h2><p className="mt-4 text-sm leading-6 text-slate-400">The value comes from running the same clear process across multiple market periods.</p></div>
          <ol className="border-l border-white/10">
            {STEPS.map(({ icon: Icon, title, text, result }, index) => <li key={title} className="relative border-b border-white/10 py-7 pl-9 first:pt-0 last:border-0 last:pb-0"><span className={`absolute -left-4 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-surface-950 font-mono text-xs text-brand-300 ${index === 0 ? "top-0" : "top-7"}`}>{index + 1}</span><div className="flex items-center gap-3"><Icon size={18} className="text-brand-300" /><h3 className="text-xl font-semibold text-white">{title}</h3></div><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{text}</p><p className="mt-3 text-xs font-medium text-slate-300">Outcome: {result}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="py-16 sm:py-20"><div className="container-page grid items-center gap-10 lg:grid-cols-2 lg:gap-14"><div className="overflow-hidden rounded-xl border border-white/10 bg-surface-900 p-1.5"><Image src="/product/session-dashboard-20260814.webp" alt="Saved ForexTestLab sessions" width={1600} height={940} className="h-auto w-full rounded-lg" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Continue later</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Your work does not disappear between sessions.</h2><p className="mt-4 text-base leading-7 text-slate-400">Return through the dashboard, reopen the selected session, and continue from the replay state you saved.</p><Link href="/features" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">Explore all features <ArrowRight size={15} /></Link></div></div></section>
    </PageShell>
  );
}
