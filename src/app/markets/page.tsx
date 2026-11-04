import type { Metadata } from "next";

import { MarketsExplorer } from "@/components/MarketsExplorer";
import { PageShell } from "@/components/PageShell";
import { SYMBOL_DEFINITIONS } from "@/lib/market-data/symbols";

export const metadata: Metadata = {
  title: "Markets",
  description: "Explore forex, index, cryptocurrency, metals and energy data from Dukascopy and HistData for historical replay in ForexTestLab.",
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
    <section className="relative overflow-hidden bg-[#f6f9f6] pb-16 pt-14 sm:pb-24 sm:pt-20">
      <div className="container-page relative">
        <div className="mb-8 flex flex-col justify-between gap-5 border-b border-[#d7e2dc] pb-8 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-[#08745c]">Market archive</p>
            <h1 className="text-4xl font-bold leading-tight tracking-[-.04em] text-[#10251d] sm:text-5xl">Find a market. Replay its history.</h1>
            <p className="mt-3 text-sm text-[#3f5a50]">Search instruments and compare data providers before starting a backtest.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#3f5a50]">
            <span className="rounded-full border border-[#d7e2dc] bg-white px-3 py-2">1-minute base data</span>
            <span className="rounded-full border border-[#b9d7c8] bg-[#eaf6ef] px-3 py-2">Dukascopy + HistData</span>
          </div>
        </div>
        <MarketsExplorer initialMarkets={INITIAL_MARKETS} />
      </div>
    </section>
  </PageShell>;
}
