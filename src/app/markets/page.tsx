import { MarketsExplorer } from "@/components/MarketsExplorer";
import { PageShell } from "@/components/PageShell";
import { marketingMetadata } from "@/lib/marketing-metadata";
import { SYMBOL_DEFINITIONS } from "@/lib/market-data/symbols";

export const metadata = marketingMetadata({
  title: "Markets",
  description: "Explore forex, index, cryptocurrency, metals and energy data from Dukascopy and HistData for historical replay in ForexTestLab.",
  path: "/markets",
});

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
    <section className="relative overflow-hidden bg-surface-950 pb-16 pt-14 sm:pb-24 sm:pt-20">
      <div className="container-page relative">
        <div className="mb-8 flex flex-col justify-between gap-5 border-b border-white/10 pb-8 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-brand-300">Market archive</p>
            <h1 className="text-4xl font-bold leading-tight tracking-[-.04em] text-white sm:text-5xl">Find a market. Replay its history.</h1>
            <p className="mt-3 text-sm text-slate-400">Search instruments and compare data providers. On forex, metals and US indices, real ticks decide stops, targets and fills inside each candle.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-surface-900 px-3 py-2">1-minute candles</span>
            <span className="rounded-full border border-brand-400/25 bg-brand-400/10 text-brand-200 px-3 py-2">Real tick data on 33 markets</span>
            <span className="rounded-full border border-brand-400/25 bg-brand-400/10 text-brand-200 px-3 py-2">Dukascopy + HistData</span>
          </div>
        </div>
        <MarketsExplorer initialMarkets={INITIAL_MARKETS} />
      </div>
    </section>
  </PageShell>;
}
