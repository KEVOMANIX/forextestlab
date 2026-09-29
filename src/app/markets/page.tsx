import type { Metadata } from "next";
import { Database, Gauge, SlidersHorizontal } from "lucide-react";

import { MarketsExplorer } from "@/components/MarketsExplorer";
import { PageShell } from "@/components/PageShell";
import { SYMBOL_DEFINITIONS } from "@/lib/market-data/symbols";

export const metadata: Metadata = {
  title: "Markets",
  description: "Explore forex, index, cryptocurrency, and metals data available for historical replay in ForexTestLab.",
  alternates: { canonical: "/markets" },
};

const INITIAL_MARKETS = SYMBOL_DEFINITIONS.map((market) => ({
  symbol: market.symbol,
  displayName: market.displayName,
  baseCurrency: market.baseCurrency,
  quoteCurrency: market.quoteCurrency,
  pipSize: market.pipSize,
  pricePrecision: market.pricePrecision,
  enabled: true,
}));

export default function MarketsPage() {
  return <PageShell>
    <section className="relative overflow-hidden border-b border-white/10 pb-14 pt-16 sm:pb-20 sm:pt-24"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(69,214,168,.13),transparent_34%)]"/><div className="container-page relative"><div className="grid gap-10 lg:grid-cols-[1fr_.78fr] lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-300">Market catalogue</p><h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.05] tracking-[-.045em] text-white sm:text-6xl">Choose the market. <span className="text-brand-300">Test the history.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Search the instruments available for replay, inspect their data coverage, and carry your selection directly into a new backtest.</p></div><div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 bg-white/10">{[["38", "instruments"], ["4", "asset groups"], ["1m", "base data"]].map(([value, label]) => <div key={label} className="bg-surface-900/90 px-4 py-5 text-center"><p className="font-mono text-2xl font-bold text-white">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[.13em] text-slate-500">{label}</p></div>)}</div></div></div></section>

    <section className="py-14 sm:py-20"><div className="container-page"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-300">Replay inventory</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Find your next test.</h2></div><p className="max-w-md text-sm leading-6 text-slate-400">Coverage is read from the active market data library and may vary by instrument.</p></div><MarketsExplorer initialMarkets={INITIAL_MARKETS} /></div></section>

    <section className="border-y border-white/10 bg-surface-900/35 py-14"><div className="container-page grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">{[
      [Database, "Historical depth", "Inspect the actual available start and end date before creating a session."],
      [Gauge, "One-minute foundation", "Build replay sessions from detailed base data across supported timeframes."],
      [SlidersHorizontal, "Your test parameters", "Choose the replay period, account size, and risk rules after selecting a market."],
    ].map(([Icon, title, text]) => { const FeatureIcon = Icon as typeof Database; return <article key={String(title)} className="bg-surface-950 p-7"><FeatureIcon size={19} className="text-brand-300" aria-hidden/><h3 className="mt-5 font-semibold text-white">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{String(text)}</p></article>; })}</div></section>
  </PageShell>;
}
