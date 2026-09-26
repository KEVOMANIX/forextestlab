import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, LayoutDashboard, NotebookPen, Play, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore ForexTestLab market replay, simulated execution, journaling, analytics, and strategy-review tools.",
  alternates: { canonical: "/features" },
};

const ANNOTATIONS = [
  ["1", "Replay controls", "Advance one candle or change replay speed."],
  ["2", "Chart context", "Switch timeframes and layouts without changing the replay clock."],
  ["3", "Trade execution", "Place and manage simulated orders from the chart."],
  ["4", "Workspace tools", "Open saved sessions, statistics, news, and settings."],
] as const;

function Screenshot({
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
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-900 p-1.5 shadow-[0_32px_80px_-38px_rgba(0,0,0,.95)]">
      <Image src={src} alt={alt} width={width} height={height} priority={priority} className="h-auto w-full rounded-lg" sizes="(max-width:1024px) 100vw, 58vw" />
    </div>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return <ul className="mt-6 space-y-3">{items.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-300"><Check size={16} className="mt-1 shrink-0 text-brand-300" aria-hidden />{item}</li>)}</ul>;
}

export default function FeaturesPage() {
  return (
    <PageShell>
      <header className="border-b border-white/10 py-10 sm:py-12">
        <div className="container-page">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Product</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">Features</h1>
            <p className="max-w-2xl text-base leading-7 text-slate-400 lg:justify-self-end">Everything needed to replay historical markets, execute simulated trades, document decisions, and review the evidence.</p>
          </div>
        </div>
      </header>

      <section className="py-10 sm:py-14">
        <div className="container-page">
          <div className="relative">
            <Screenshot src="/product/replay-desk-20260909.webp" alt="Annotated ForexTestLab replay workspace" width={1911} height={826} priority />
            <span className="absolute left-[43%] top-[43%] grid h-8 w-8 place-items-center rounded-full border-2 border-surface-950 bg-brand-400 font-mono text-xs font-bold text-surface-950 shadow-lg">1</span>
            <span className="absolute left-[16%] top-[8%] grid h-8 w-8 place-items-center rounded-full border-2 border-surface-950 bg-brand-400 font-mono text-xs font-bold text-surface-950 shadow-lg">2</span>
            <span className="absolute bottom-[5%] left-[48%] grid h-8 w-8 place-items-center rounded-full border-2 border-surface-950 bg-brand-400 font-mono text-xs font-bold text-surface-950 shadow-lg">3</span>
            <span className="absolute right-[3%] top-[32%] grid h-8 w-8 place-items-center rounded-full border-2 border-surface-950 bg-brand-400 font-mono text-xs font-bold text-surface-950 shadow-lg">4</span>
          </div>
          <ol className="mt-6 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {ANNOTATIONS.map(([number, title, text]) => <li key={number} className="bg-surface-950 p-4"><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-brand-300">{number}</span><h2 className="text-sm font-semibold text-white">{title}</h2></div><p className="mt-2 text-xs leading-5 text-slate-400">{text}</p></li>)}
          </ol>
        </div>
      </section>

      <div className="border-t border-white/10">
        <section id="replay" className="scroll-mt-24 py-12 sm:py-14">
          <div className="container-page grid items-center gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-12">
            <div><Play size={22} className="text-brand-300" aria-hidden /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Historical replay</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">Move through the market without seeing what happens next.</h2><p className="mt-4 text-base leading-7 text-slate-400">Select a historical period, control the replay pace, and study each decision using only information available at that moment.</p><Points items={["Step forward candle by candle", "Choose replay speed or pause at any time", "Load earlier context without revealing future data"]} /></div>
            <Screenshot src="/product/market-replay-20260814-v2.webp" alt="Historical market replay charts" width={1786} height={880} />
          </div>
        </section>

        <section id="orders" className="scroll-mt-24 border-y border-white/10 bg-surface-900/30 py-12 sm:py-14">
          <div className="container-page grid items-center gap-8 lg:grid-cols-[1.28fr_.72fr] lg:gap-12"><Screenshot src="/product/market-replay.webp" alt="Simulated trading order controls" width={1600} height={940} /><div><ShieldCheck size={22} className="text-brand-300" aria-hidden /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Orders and risk</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">Plan and manage the complete simulated position.</h2><p className="mt-4 text-base leading-7 text-slate-400">Practise the execution process with account-aware position sizing, pending orders, and visible risk and reward levels.</p><Points items={["Market, limit, and stop entries", "Adjustable stop-loss and take-profit levels", "Position sizing based on account risk"]} /></div></div>
        </section>

        <section id="charting" className="scroll-mt-24 py-12 sm:py-14">
          <div className="container-page grid items-center gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-12"><div><LayoutDashboard size={22} className="text-brand-300" aria-hidden /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Charting workspace</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">Keep market context visible across layouts.</h2><p className="mt-4 text-base leading-7 text-slate-400">Use synchronized charts, change timeframe, and apply drawing tools while every pane follows the same replay moment.</p><Points items={["Multiple chart layouts", "Independent timeframe and scale controls", "Saved drawings and technical studies"]} /></div><Screenshot src="/product/replay-desk-20260909.webp" alt="ForexTestLab multi-chart layout" width={1911} height={826} /></div>
        </section>

        <section id="journal" className="scroll-mt-24 border-y border-white/10 bg-surface-900/30 py-12 sm:py-14">
          <div className="container-page grid items-center gap-8 lg:grid-cols-[1.28fr_.72fr] lg:gap-12"><Screenshot src="/product/session-dashboard-20260814.webp" alt="Saved trading sessions and review workspace" width={1600} height={940} /><div><NotebookPen size={22} className="text-brand-300" aria-hidden /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Trade journal</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">Record the reasoning while it is still fresh.</h2><p className="mt-4 text-base leading-7 text-slate-400">Attach structured notes to each trade, then return to the entry candle and compare the original plan with the outcome.</p><Points items={["Setup, emotion, confidence, and mistake tags", "Before-entry and after-exit snapshots", "Interactive chart review for every recorded trade"]} /></div></div>
        </section>

        <section id="analytics" className="scroll-mt-24 py-12 sm:py-14">
          <div className="container-page grid items-center gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-12"><div><BarChart3 size={22} className="text-brand-300" aria-hidden /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Performance review</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">Find the pattern behind the final balance.</h2><p className="mt-4 text-base leading-7 text-slate-400">Move beyond net profit with drawdown, expectancy, timing, streak, session, and execution-quality analysis.</p><Points items={["Equity and drawdown history", "Performance by time, day, session, and direction", "Experimental trades excluded from strategy results"]} /></div><Screenshot src="/product/session-analytics-20260814.webp" alt="ForexTestLab performance analytics" width={1600} height={940} /></div>
        </section>

        <section id="sessions" className="scroll-mt-24 border-t border-white/10 py-12 sm:py-14">
          <div className="container-page grid items-center gap-8 lg:grid-cols-[1.28fr_.72fr] lg:gap-12"><Screenshot src="/product/session-dashboard.webp" alt="ForexTestLab session dashboard" width={1600} height={940} /><div><LayoutDashboard size={22} className="text-brand-300" aria-hidden /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Saved sessions</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">Continue from the state you saved.</h2><p className="mt-4 text-base leading-7 text-slate-400">Return through the dashboard, reopen the selected test, and keep its replay progress, trades, drawings, and loaded history.</p><Points items={["Active and completed session history", "Remembered dashboard selection", "Session-level analytics and trade review"]} /></div></div>
        </section>
      </div>

      <section className="border-t border-white/10 py-14"><div className="container-page flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><h2 className="text-xl font-semibold text-white">Try the complete workflow.</h2><p className="mt-1 text-sm text-slate-400">Create a replay session and keep the result in your private workspace.</p></div><Link href={TRIAL_SIGN_UP_PATH} className="btn-primary shrink-0">Start free trial <ArrowRight size={16} aria-hidden /></Link></div></section>
    </PageShell>
  );
}
