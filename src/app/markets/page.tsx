import type { Metadata } from "next";

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
    <section className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_74%_5%,rgba(69,214,168,.12),transparent_38%)]" />
      <div className="container-page relative">
        <div className="mb-8 flex flex-col justify-between gap-5 border-b border-white/10 pb-8 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-300">Market atlas</p>
            <h1 className="mt-3 text-4xl font-bold leading-none tracking-[-.04em] text-white sm:text-5xl">Explore the archive.</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-surface-900/80 px-3 py-2">38 instruments</span>
            <span className="rounded-full border border-white/10 bg-surface-900/80 px-3 py-2">1-minute base data</span>
            <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-2 text-brand-200">Source · Dukascopy</span>
          </div>
        </div>
        <MarketsExplorer initialMarkets={INITIAL_MARKETS} />
      </div>
    </section>
  </PageShell>;
}
