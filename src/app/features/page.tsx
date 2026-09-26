import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Clock3, Layers3, NotebookPen, Play, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore ForexTestLab market replay, simulated execution, journaling, analytics, and strategy-review tools.",
  alternates: { canonical: "/features" },
};

const CORE = [
  { icon: Play, title: "Replay without hindsight", text: "Advance historical markets candle by candle while unrevealed price action stays hidden." },
  { icon: Layers3, title: "Keep timeframes synchronized", text: "Study intraday execution and higher-timeframe context inside the same replay clock." },
  { icon: ShieldCheck, title: "Model the full position", text: "Set size, entry, stop, target, and pending orders against a simulated account." },
  { icon: Clock3, title: "Resume exactly where you stopped", text: "Sessions retain replay progress, trades, layouts, drawings, and loaded history." },
] as const;

const REVIEW = [
  "Equity, drawdown, expectancy, win rate, and profit factor",
  "Trade-by-trade journal with tags, screenshots, and lessons",
  "Interactive chart review at the exact entry and exit",
  "Timing, session, direction, streak, and execution analysis",
] as const;

function ProductFrame({ src, alt, width, height, priority = false }: { src: string; alt: string; width: number; height: number; priority?: boolean }) {
  return <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-900 p-1.5 shadow-[0_28px_70px_-38px_rgba(0,0,0,.95)]"><Image src={src} alt={alt} width={width} height={height} priority={priority} className="h-auto w-full rounded-lg" sizes="(max-width: 1024px) 100vw, 58vw" /></div>;
}

export default function FeaturesPage() {
  return (
    <PageShell>
      <section className="border-b border-white/10 py-12 sm:py-16 lg:py-20">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Inside the workspace</p>
            <h1 className="mt-4 text-balance text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">Backtest the decision, not only the outcome.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">Replay, execution, journaling, and analysis stay connected to the same historical session.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Link href={TRIAL_SIGN_UP_PATH} className="btn-primary">Start free trial <ArrowRight size={16} /></Link><Link href="/how-it-works" className="btn-secondary">See the workflow</Link></div>
          </div>
          <ProductFrame src="/product/market-replay-20260814-v2.webp" alt="ForexTestLab historical market replay workspace" width={1786} height={880} priority />
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Replay and execution</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Everything needed while the market is moving.</h2></div>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {CORE.map(({ icon: Icon, title, text }) => <article key={title} className="border-t border-white/10 pt-5"><Icon size={19} className="text-brand-300" aria-hidden /><h3 className="mt-4 font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-surface-900/35 py-16 sm:py-20">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr] lg:gap-16">
          <ProductFrame src="/product/session-analytics-20260814.webp" alt="ForexTestLab session analytics report" width={1600} height={940} />
          <div>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-surface-900 text-brand-300"><BarChart3 size={19} /></span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Review and improve</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Results that lead back to the trade.</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">Summary metrics show what happened. The journal and marked trade chart help explain why.</p>
            <ul className="mt-7 space-y-4">{REVIEW.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-300"><Check size={17} className="mt-0.5 shrink-0 text-brand-300" />{item}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="py-14"><div className="container-page flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><NotebookPen size={20} className="mt-1 text-brand-300" /><div><h2 className="text-xl font-semibold text-white">Build a record you can revisit.</h2><p className="mt-1 text-sm text-slate-400">Every session remains available from your private dashboard.</p></div></div><Link href="/pricing" className="btn-secondary shrink-0">View pricing</Link></div></section>
    </PageShell>
  );
}
