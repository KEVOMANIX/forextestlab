"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CalendarRange, Check, Coins, Database, Search } from "lucide-react";

import { CurrencyFlag, hasCurrencyFlag } from "@/components/app/CurrencyFlag";
import { fetchSymbols } from "@/lib/backtest/client";
import { describeSymbol } from "@/lib/market-data/symbols";
import type { MarketSymbol } from "@/lib/market-data/types";

type Category = "All" | "Forex" | "Indices" | "Crypto" | "Metals";

const CATEGORIES: Category[] = ["All", "Forex", "Indices", "Crypto", "Metals"];
const CRYPTO_CURRENCIES = new Set(["BTC", "ETH", "LTC", "ADA"]);
const METAL_CURRENCIES = new Set(["XAU", "XAG"]);

function categoryFor(item: MarketSymbol): Exclude<Category, "All"> {
  if (CRYPTO_CURRENCIES.has(item.baseCurrency)) return "Crypto";
  if (METAL_CURRENCIES.has(item.baseCurrency)) return "Metals";
  if (item.symbol.includes("IDX") || item.symbol === "DXY") return "Indices";
  return "Forex";
}

function historyYears(item: MarketSymbol): number | null {
  if (!item.availableFromYear || !item.availableThroughYear) return null;
  return Math.max(1, item.availableThroughYear - item.availableFromYear);
}

function MarketMark({ market, large = false }: { market: MarketSymbol; large?: boolean }) {
  const category = categoryFor(market);
  const primarySize = large ? 38 : 30;
  const secondarySize = large ? 24 : 19;

  if (category === "Indices") {
    return <span className={`relative grid shrink-0 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-200 ${large ? "h-14 w-14" : "h-11 w-11"}`} aria-hidden>
      <BarChart3 size={large ? 25 : 20} strokeWidth={1.8} />
      <CurrencyFlag currency="USD" size={secondarySize} className="absolute -bottom-1 -right-1 block" />
    </span>;
  }

  if (category === "Crypto" && !hasCurrencyFlag(market.baseCurrency)) {
    return <span className={`relative grid shrink-0 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-200 ${large ? "h-14 w-14" : "h-11 w-11"}`} aria-hidden>
      <Coins size={large ? 25 : 20} strokeWidth={1.8} />
      <CurrencyFlag currency="USD" size={secondarySize} className="absolute -bottom-1 -right-1 block" />
    </span>;
  }

  return <span className={`relative block shrink-0 ${large ? "h-14 w-14" : "h-11 w-11"}`} aria-hidden>
    <CurrencyFlag currency={market.quoteCurrency} size={primarySize} className="absolute bottom-0 right-0 block" />
    <CurrencyFlag currency={market.baseCurrency} size={primarySize} className="absolute left-0 top-0 block" />
  </span>;
}

function MarketCard({ market, selected, onSelect }: { market: MarketSymbol; selected: boolean; onSelect: () => void }) {
  const years = historyYears(market);

  return <button type="button" onClick={onSelect} className={`group relative min-h-52 overflow-hidden rounded-2xl border p-5 text-left transition-all ${selected ? "border-brand-400/70 bg-[linear-gradient(145deg,rgba(69,214,168,.14),rgba(22,36,31,.84))] shadow-[0_18px_45px_rgba(0,0,0,.2)]" : "border-white/10 bg-surface-900/65 hover:-translate-y-0.5 hover:border-brand-400/35 hover:bg-surface-900"}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-300">{categoryFor(market)}{years !== null ? ` · ${years} years` : ""}</p>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-white">{market.displayName}</h2>
        <p className="mt-1 text-xs text-slate-400">{describeSymbol(market.symbol)}</p>
      </div>
      <MarketMark market={market} />
    </div>

    <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
      <div><p className="text-[9px] uppercase tracking-[.13em] text-slate-500">Data starts</p><p className="mt-1 font-mono text-sm font-semibold text-slate-100">{market.availableFromYear ?? "—"}</p></div>
      <div><p className="text-[9px] uppercase tracking-[.13em] text-slate-500">Base</p><p className="mt-1 font-mono text-sm font-semibold text-slate-100">1 minute</p></div>
      <div><p className="text-[9px] uppercase tracking-[.13em] text-slate-500">Source</p><p className="mt-1 truncate text-xs font-semibold text-brand-200">Dukascopy</p></div>
    </div>

    <div className="mt-4 flex items-center justify-between rounded-lg border border-white/[.07] bg-surface-950/35 px-3 py-2.5">
      <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500"><CalendarRange size={13} className="text-brand-300" aria-hidden />Archive</span>
      <span className="font-mono text-xs font-semibold text-slate-300">{market.availableFromYear && market.availableThroughYear ? `${market.availableFromYear} → ${market.availableThroughYear}` : "Checking availability"}</span>
    </div>
    {selected && <span className="absolute right-4 top-[4.35rem] grid h-6 w-6 place-items-center rounded-full bg-brand-400 text-surface-950"><Check size={13} strokeWidth={3} aria-hidden /></span>}
  </button>;
}

function signInForMarket(symbol: string): string {
  const backtestPath = `/app/backtest?market=${encodeURIComponent(symbol)}`;
  return `/sign-in?next=${encodeURIComponent(backtestPath)}`;
}

export function MarketsExplorer({ initialMarkets }: { initialMarkets: MarketSymbol[] }) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(initialMarkets[0]?.symbol ?? "");

  useEffect(() => {
    let active = true;
    void fetchSymbols().then((items) => {
      if (!active || items.length === 0) return;
      const enabled = items.filter((item) => item.enabled);
      if (enabled.length > 0) {
        setMarkets(enabled);
        setSelected((current) => enabled.some((item) => item.symbol === current) ? current : enabled[0]!.symbol);
      }
    });
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => {
    const result: Record<Category, number> = { All: markets.length, Forex: 0, Indices: 0, Crypto: 0, Metals: 0 };
    for (const market of markets) result[categoryFor(market)] += 1;
    return result;
  }, [markets]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return markets.filter((market) => {
      if (category !== "All" && categoryFor(market) !== category) return false;
      if (!needle) return true;
      return `${market.symbol} ${market.displayName} ${describeSymbol(market.symbol)}`.toLowerCase().includes(needle);
    });
  }, [category, markets, query]);

  const displayed = showAll || query.trim() ? filtered : filtered.slice(0, 8);
  const activeMarket = markets.find((market) => market.symbol === selected) ?? markets[0];
  const activeYears = activeMarket ? historyYears(activeMarket) : null;

  return <>
    <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
      <div className="relative min-w-0 flex-1">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
        <label htmlFor="market-search" className="sr-only">Search markets</label>
        <input id="market-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${markets.length} markets`} className="w-full rounded-xl border border-white/10 bg-surface-900/65 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60" />
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-surface-900/65 p-1.5" role="group" aria-label="Market categories">
        {CATEGORIES.map((item) => <button key={item} type="button" onClick={() => { setCategory(item); setShowAll(false); }} aria-pressed={category === item} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${category === item ? "bg-brand-400/15 text-brand-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{item} <span className="ml-1 opacity-50">{counts[item]}</span></button>)}
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.55fr)] xl:items-start">
      <section>
        {displayed.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{displayed.map((market) => <MarketCard key={market.symbol} market={market} selected={market.symbol === activeMarket?.symbol} onSelect={() => setSelected(market.symbol)} />)}</div> : <div className="rounded-2xl border border-white/10 bg-surface-900/65 px-5 py-16 text-center"><p className="font-medium text-white">No market matches that search.</p><button type="button" onClick={() => { setQuery(""); setCategory("All"); }} className="mt-3 text-sm text-brand-300 hover:text-brand-200">Clear filters</button></div>}
        {!showAll && !query.trim() && filtered.length > displayed.length && <div className="mt-5 text-center"><button type="button" onClick={() => setShowAll(true)} className="rounded-xl border border-white/10 bg-surface-900/55 px-5 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:border-brand-400/40 hover:text-brand-200">Show all {filtered.length} {category === "All" ? "markets" : category.toLowerCase()}</button></div>}
      </section>

      {activeMarket && <aside className="overflow-hidden rounded-2xl border border-brand-400/30 bg-[linear-gradient(155deg,rgba(69,214,168,.14),rgba(13,29,23,.97)_38%)] shadow-[0_24px_70px_rgba(0,0,0,.24)] xl:sticky xl:top-24">
        <div className="border-b border-white/10 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-300">Selected market</p>
          <div className="mt-5 flex items-start justify-between gap-5"><div><h2 className="text-3xl font-bold tracking-tight text-white">{activeMarket.displayName}</h2><p className="mt-1 text-sm text-slate-400">{describeSymbol(activeMarket.symbol)}</p></div><MarketMark market={activeMarket} large /></div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-surface-950/55 p-4"><p className="text-[9px] uppercase tracking-[.14em] text-slate-500">Data starts</p><p className="mt-1.5 font-mono text-xl font-bold text-white">{activeMarket.availableFromYear ?? "—"}</p></div>
            <div className="rounded-xl border border-white/10 bg-surface-950/55 p-4"><p className="text-[9px] uppercase tracking-[.14em] text-slate-500">History</p><p className="mt-1.5 font-mono text-xl font-bold text-brand-200">{activeYears !== null ? `${activeYears} yrs` : "—"}</p></div>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-surface-950/45 p-4">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-400"><CalendarRange size={15} className="text-brand-300" aria-hidden />Archive period</span>
            <span className="font-mono text-sm font-bold text-slate-100">{activeMarket.availableFromYear && activeMarket.availableThroughYear ? `${activeMarket.availableFromYear} → ${activeMarket.availableThroughYear}` : "Checking"}</span>
          </div>

          <dl className="mt-5 divide-y divide-white/10 border-y border-white/10">
            <div className="flex items-center justify-between gap-4 py-3.5"><dt className="flex items-center gap-2 text-sm text-slate-500"><Database size={15} className="text-brand-300" aria-hidden />Source</dt><dd className="text-sm font-semibold text-brand-200">Dukascopy</dd></div>
            <div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-slate-500">Base timeframe</dt><dd className="font-mono text-sm font-semibold text-slate-200">1 minute</dd></div>
            <div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-slate-500">Asset class</dt><dd className="text-sm font-semibold text-slate-200">{categoryFor(activeMarket)}</dd></div>
          </dl>

          <Link href={signInForMarket(activeMarket.symbol)} className="btn-primary mt-6 w-full">Backtest {activeMarket.displayName} <ArrowRight size={16} aria-hidden /></Link>
        </div>
      </aside>}
    </div>
  </>;
}
