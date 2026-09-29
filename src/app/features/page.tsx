import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenText, Check, Crosshair, Layers3, Play, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { ProductDemoVideo } from "@/components/ProductDemoVideo";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export const metadata: Metadata = {
  title: "Backtesting Features",
  description: "Replay historical markets, practise execution, journal decisions, and review strategy performance in one connected workspace.",
  alternates: { canonical: "/features" },
};

const WORKFLOW = [
  { number: "01", title: "Define", text: "Choose the markets, dates, account size, and testing rules." },
  { number: "02", title: "Replay", text: "Advance without future data and execute the plan as price unfolds." },
  { number: "03", title: "Record", text: "Capture the setup, decision, emotion, and result while context is fresh." },
  { number: "04", title: "Improve", text: "Use the evidence to isolate repeatable strengths and costly mistakes." },
] as const;

function Checklist({ items }: { items: readonly string[] }) {
  return <ul className="mt-5 space-y-2.5">{items.map((item) => <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-300"><Check size={15} className="mt-1 shrink-0 text-brand-300" aria-hidden />{item}</li>)}</ul>;
}

function JournalPreview() {
  return <div className="mt-7 rounded-xl border border-white/10 bg-surface-950/70 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-white">London continuation</span><span className="rounded-full bg-brand-400/10 px-2 py-1 text-[10px] font-semibold text-brand-200">A setup</span></div><p className="mt-3 text-xs leading-5 text-slate-400">Waited for the retest. Entry followed the plan; stop stayed below structure.</p><div className="mt-4 flex gap-1.5">{["patient", "trend", "planned"].map((tag) => <span key={tag} className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-400">{tag}</span>)}</div></div>;
}

function AnalyticsPreview() {
  return <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-surface-950/70 p-4"><div className="flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-slate-500">Net result</p><p className="mt-1 font-mono text-xl font-semibold text-emerald-300">+$2,779.75</p></div><p className="text-xs text-slate-400">46% win rate</p></div><svg className="mt-5 h-24 w-full" viewBox="0 0 480 100" role="img" aria-label="Rising example equity curve"><defs><linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#45d6a8" stopOpacity=".28"/><stop offset="1" stopColor="#45d6a8" stopOpacity="0"/></linearGradient></defs><path d="M0 80 L34 73 L62 79 L92 57 L122 63 L150 42 L179 50 L211 31 L242 45 L271 34 L304 18 L337 29 L370 12 L404 23 L438 7 L480 17 L480 100 L0 100 Z" fill="url(#equity-fill)"/><path d="M0 80 L34 73 L62 79 L92 57 L122 63 L150 42 L179 50 L211 31 L242 45 L271 34 L304 18 L337 29 L370 12 L404 23 L438 7 L480 17" fill="none" stroke="#45d6a8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>;
}

export default function FeaturesPage() {
  return <PageShell>
    <section className="relative overflow-hidden border-b border-white/10 py-5 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_50%,rgba(69,214,168,.11),transparent_42%)]" />
      <div className="container-page relative">
        <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-2xl border border-white/15 bg-surface-950 shadow-[0_44px_120px_-54px_rgba(45,212,191,.42)]">
          <div className="[&_img]:h-auto [&_img]:w-full [&_video]:h-auto [&_video]:w-full [&_video]:object-contain">
            <ProductDemoVideo webm="/product/replay-controls-demo.webm" mp4="/product/replay-controls-demo.mp4" poster="/product/replay-controls-demo-poster.jpg" alt="ForexTestLab historical replay workspace" width={1280} height={633} priority />
          </div>
          <div className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(5,16,12,.97)_0%,rgba(5,16,12,.84)_31%,rgba(5,16,12,.32)_59%,rgba(5,16,12,.05)_100%)] xl:block" />
          <div className="relative z-10 border-t border-white/10 bg-surface-950/95 p-6 sm:p-8 xl:absolute xl:left-16 xl:top-1/2 xl:w-[34rem] xl:-translate-y-1/2 xl:border-0 xl:bg-transparent xl:p-0">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-300">The complete testing workspace</p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.02] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">Practise the decision.<br /><span className="text-slate-300">Study the outcome.</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-slate-300">Replay historical markets, manage simulated risk, and turn every trade into evidence you can review.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link href={TRIAL_SIGN_UP_PATH} className="btn-primary">Start free trial <ArrowRight size={16} aria-hidden /></Link><Link href="/markets" className="btn-secondary">Explore 38 markets</Link></div>
          </div>
          <div className="relative z-10 grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3 xl:absolute xl:bottom-6 xl:right-6 xl:flex xl:border-0 xl:bg-transparent">
            {["Historical replay", "Simulated execution", "Session analytics"].map((label) => <span key={label} className="bg-surface-900/95 px-4 py-3 text-center text-[11px] font-medium text-slate-300 backdrop-blur xl:rounded-lg xl:border xl:border-white/15 xl:bg-surface-950/80">{label}</span>)}
          </div>
        </div>
      </div>
    </section>

    <section id="workflow" className="scroll-mt-24 border-b border-white/10 py-14 sm:py-20"><div className="container-page"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-300">One continuous workflow</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">From idea to reviewed evidence.</h2></div><p className="max-w-md text-sm leading-6 text-slate-400">The session keeps the chart state, trades, notes, and results together from the first candle to final review.</p></div><ol className="mt-10 grid overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-4 md:gap-px">{WORKFLOW.map((step, index) => <li key={step.number} className="relative bg-surface-950 p-6 sm:p-7"><span className="font-mono text-xs text-brand-300">{step.number}</span><h3 className="mt-8 text-xl font-semibold text-white">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{step.text}</p>{index < WORKFLOW.length - 1 && <ArrowRight size={16} className="absolute right-5 top-6 hidden text-slate-600 md:block" aria-hidden />}</li>)}</ol></div></section>

    <section className="py-16 sm:py-24"><div className="container-page"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-300">Inside the workspace</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Four kinds of evidence. One testing record.</h2></div><div className="mt-10 grid gap-4 lg:grid-cols-12">
      <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface-900/70 p-6 lg:col-span-7 sm:p-8"><Play size={20} className="text-brand-300" aria-hidden /><p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-brand-300">Historical replay</p><h3 className="mt-3 text-2xl font-semibold text-white">Practise without future knowledge.</h3><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Move candle by candle, change speed, compare synchronized timeframes, and make the decision before the next move is revealed.</p><div className="mt-7 overflow-hidden rounded-xl border border-white/10"><ProductDemoVideo webm="/product/replay-controls-demo.webm" mp4="/product/replay-controls-demo.mp4" poster="/product/replay-controls-demo-poster.jpg" alt="Historical charts moving through synchronized replay" width={1280} height={633} /></div></article>
      <article className="rounded-2xl border border-white/10 bg-surface-900/70 p-6 lg:col-span-5 sm:p-8"><Crosshair size={20} className="text-brand-300" aria-hidden /><p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-brand-300">Execution and risk</p><h3 className="mt-3 text-2xl font-semibold text-white">Turn a thesis into a defined trade.</h3><p className="mt-3 text-sm leading-6 text-slate-400">Plan position size, entry, stop, and target before committing the simulated order.</p><div className="mt-7 rounded-xl border border-white/10 bg-surface-950/70 p-4"><div className="flex gap-2"><span className="flex-1 rounded-lg bg-brand-400/15 px-3 py-2 text-center text-xs font-semibold text-brand-200">Buy</span><span className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-center text-xs text-slate-400">Sell</span></div><div className="mt-4 grid grid-cols-3 gap-2">{[["Risk", "1.00%"], ["Stop", "18.4 pips"], ["Target", "2.1 R"]].map(([a,b]) => <div key={a} className="rounded-lg border border-white/10 p-3"><p className="text-[10px] text-slate-500">{a}</p><p className="mt-1 font-mono text-xs font-semibold text-white">{b}</p></div>)}</div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full w-[48%] rounded-full bg-brand-400" /></div></div><Checklist items={["Market, limit, and stop entries", "Visible reward-to-risk before entry", "Account-aware position sizing"]} /></article>
      <article className="rounded-2xl border border-white/10 bg-surface-900/70 p-6 lg:col-span-4 sm:p-8"><BookOpenText size={20} className="text-brand-300" aria-hidden /><p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-brand-300">Decision journal</p><h3 className="mt-3 text-2xl font-semibold text-white">Keep the reason beside the result.</h3><p className="mt-3 text-sm leading-6 text-slate-400">Review what you saw, what you did, and whether the execution matched the plan.</p><JournalPreview /></article>
      <article className="rounded-2xl border border-white/10 bg-surface-900/70 p-6 lg:col-span-5 sm:p-8"><BarChart3 size={20} className="text-brand-300" aria-hidden /><p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-brand-300">Strategy analytics</p><h3 className="mt-3 text-2xl font-semibold text-white">Read the shape of performance.</h3><p className="mt-3 text-sm leading-6 text-slate-400">Inspect expectancy, win rate, payoff, timing, streaks, and the equity curve for each session.</p><AnalyticsPreview /></article>
      <article className="rounded-2xl border border-brand-400/25 bg-[linear-gradient(145deg,rgba(69,214,168,.12),rgba(30,48,42,.72))] p-6 lg:col-span-3 sm:p-8"><Layers3 size={20} className="text-brand-300" aria-hidden /><p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-brand-300">Saved sessions</p><h3 className="mt-3 text-2xl font-semibold text-white">Return to the exact test.</h3><p className="mt-3 text-sm leading-6 text-slate-300">Replay position, charts, drawings, trades, and notes stay attached to the session.</p><div className="mt-8 space-y-2">{[["London breakout", "64%"], ["Asian range", "38%"], ["NY reversal", "12%"]].map(([name, progress]) => <div key={name} className="rounded-lg border border-white/10 bg-surface-950/50 p-3"><div className="flex justify-between text-xs"><span className="text-slate-200">{name}</span><span className="font-mono text-slate-400">{progress}</span></div><div className="mt-2 h-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-400" style={{ width: progress }} /></div></div>)}</div></article>
    </div></div></section>

    <section className="border-y border-white/10 bg-surface-900/35 py-16"><div className="container-page flex flex-col justify-between gap-7 sm:flex-row sm:items-center"><div><ShieldCheck size={22} className="text-brand-300" aria-hidden /><h2 className="mt-4 text-2xl font-semibold text-white">Build evidence before risking capital.</h2><p className="mt-2 text-sm text-slate-400">Start a replay session and keep the complete testing record in your workspace.</p></div><Link href={TRIAL_SIGN_UP_PATH} className="btn-primary shrink-0">Start free trial <ArrowRight size={16} aria-hidden /></Link></div></section>
  </PageShell>;
}
