"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarRange, Check, ChevronRight, Search } from "lucide-react";

import { fetchRanges, fetchSymbols } from "@/lib/backtest/client";
import { describeSymbol } from "@/lib/market-data/symbols";
import type { MarketSymbol } from "@/lib/market-data/types";

type Category = "All" | "Forex" | "Indices" | "Crypto" | "Metals";
const CATEGORIES: Category[] = ["All", "Forex", "Indices", "Crypto", "Metals"];
function categoryFor(item: MarketSymbol): Exclude<Category, "All"> {
  if (["BTC", "ETH", "LTC", "ADA"].includes(item.baseCurrency)) return "Crypto";
  if (["XAU", "XAG"].includes(item.baseCurrency)) return "Metals";
  if (item.symbol.includes("IDX") || item.symbol === "DXY") return "Indices";
  return "Forex";
}

function dateLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(timestamp));
}

export function MarketsExplorer({ initialMarkets }: { initialMarkets: MarketSymbol[] }) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(initialMarkets[0]?.symbol ?? "");
  const [range, setRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [loadingRange, setLoadingRange] = useState(true);

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

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingRange(true);
    void fetchRanges(selected).then((ranges) => {
      if (!active) return;
      setRange(ranges[0] ?? null);
      setLoadingRange(false);
    }).catch(() => {
      if (!active) return;
      setRange(null);
      setLoadingRange(false);
    });
    return () => { active = false; };
  }, [selected]);

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
  const displayed = showAll || query.trim() ? filtered : filtered.slice(0, 12);

  const activeMarket = markets.find((market) => market.symbol === selected) ?? markets[0];
  const years = range ? Math.max(1, Math.floor((range.endTime - range.startTime) / (365.25 * 86400000))) : null;

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.55fr)] lg:items-start">
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-surface-900/65">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="relative"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden /><label htmlFor="market-search" className="sr-only">Search markets</label><input id="market-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${markets.length} markets`} className="w-full rounded-xl border border-white/10 bg-surface-950 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60" /></div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Market categories">{CATEGORIES.map((item) => <button key={item} type="button" onClick={() => { setCategory(item); setShowAll(false); }} aria-pressed={category === item} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${category === item ? "border-brand-400/50 bg-brand-400/15 text-brand-200" : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"}`}>{item} <span className="ml-1 opacity-60">{counts[item]}</span></button>)}</div>
      </div>

      <div className="hidden grid-cols-[1fr_.7fr_.38fr] border-b border-white/10 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500 sm:grid"><span>Instrument</span><span>Market type</span><span className="text-right">Select</span></div>
      <div className="divide-y divide-white/10">
        {displayed.map((market) => {
          const active = market.symbol === activeMarket?.symbol;
          return <button key={market.symbol} type="button" onClick={() => setSelected(market.symbol)} className={`group grid w-full gap-3 px-4 py-4 text-left transition-colors sm:grid-cols-[1fr_.7fr_.38fr] sm:items-center sm:px-5 ${active ? "bg-brand-400/[0.09]" : "hover:bg-white/[0.035]"}`}>
            <span className="flex min-w-0 items-center gap-3"><span className={`grid h-10 w-12 shrink-0 place-items-center rounded-lg border font-mono text-[11px] font-bold ${active ? "border-brand-400/50 bg-brand-400/15 text-brand-200" : "border-white/10 bg-surface-950 text-slate-300"}`}>{market.baseCurrency.slice(0, 3)}</span><span className="min-w-0"><span className="block font-semibold text-white">{market.displayName}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{describeSymbol(market.symbol)}</span></span></span>
            <span className="hidden text-sm text-slate-400 sm:block">{categoryFor(market)}</span>
            <span className="flex justify-end">{active ? <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-400 text-surface-950"><Check size={14} strokeWidth={3} aria-hidden /></span> : <ChevronRight size={17} className="text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-300" aria-hidden />}</span>
          </button>;
        })}
        {filtered.length === 0 && <div className="px-5 py-16 text-center"><p className="font-medium text-white">No market matches that search.</p><button type="button" onClick={() => { setQuery(""); setCategory("All"); }} className="mt-3 text-sm text-brand-300 hover:text-brand-200">Clear filters</button></div>}
        {!showAll && !query.trim() && filtered.length > displayed.length && <div className="p-4 text-center"><button type="button" onClick={() => setShowAll(true)} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-brand-400/40 hover:text-brand-200">Show all {filtered.length} {category === "All" ? "markets" : category.toLowerCase()}</button></div>}
      </div>
    </section>

    {activeMarket && <aside className="overflow-hidden rounded-2xl border border-brand-400/25 bg-[linear-gradient(155deg,rgba(69,214,168,.13),rgba(22,36,31,.92)_42%)] lg:sticky lg:top-24">
      <div className="border-b border-white/10 p-6"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-300">Selected market</p><div className="mt-5 flex items-start justify-between gap-4"><div><h2 className="text-3xl font-bold tracking-tight text-white">{activeMarket.displayName}</h2><p className="mt-1 text-sm text-slate-400">{describeSymbol(activeMarket.symbol)}</p></div><span className="rounded-lg border border-white/10 bg-surface-950/60 px-3 py-2 text-xs font-semibold text-slate-300">{categoryFor(activeMarket)}</span></div></div>
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-white"><CalendarRange size={16} className="text-brand-300" aria-hidden />Historical coverage</div>
        <div className="mt-4 rounded-xl border border-white/10 bg-surface-950/55 p-4">{loadingRange ? <div className="space-y-3"><div className="h-5 w-40 animate-pulse rounded bg-white/10"/><div className="h-1.5 animate-pulse rounded bg-white/10"/></div> : range ? <><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.15em] text-slate-500">From</p><p className="mt-1 font-semibold text-white">{dateLabel(range.startTime)}</p></div><div className="text-right"><p className="text-[10px] uppercase tracking-[.15em] text-slate-500">Through</p><p className="mt-1 font-semibold text-white">{dateLabel(range.endTime)}</p></div></div><div className="relative mt-5 h-1.5 rounded-full bg-white/10"><div className="absolute inset-y-0 left-0 right-0 rounded-full bg-brand-400"/><span className="absolute -top-1 left-0 h-3.5 w-3.5 rounded-full border-2 border-surface-900 bg-brand-300"/><span className="absolute -top-1 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface-900 bg-brand-300"/></div><p className="mt-3 text-xs text-slate-400">{years}+ years available for replay</p></> : <p className="text-sm text-slate-400">Coverage is being prepared for this market.</p>}</div>
        <dl className="mt-5 divide-y divide-white/10 border-y border-white/10">{[["Price precision", `${activeMarket.pricePrecision} decimals`], ["Pip size", activeMarket.pipSize], ["Replay data", "1-minute base"]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3 text-sm"><dt className="text-slate-500">{label}</dt><dd className="font-mono font-medium text-slate-200">{value}</dd></div>)}</dl>
        <Link href={`/app/backtest?market=${encodeURIComponent(activeMarket.symbol)}`} className="btn-primary mt-6 w-full">Test {activeMarket.displayName} <ArrowRight size={16} aria-hidden /></Link>
        <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">Choose dates and account settings in the session creator.</p>
      </div>
    </aside>}
  </div>;
}
