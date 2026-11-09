"use client";

import { AlertCircle, ArrowRight, Check, ChevronDown, Code2, Loader2, Play, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchRanges, fetchSymbols } from "@/lib/backtest/client";
import { DEMO_RANGE_END, DEMO_RANGE_START } from "@/lib/market-data/demo-generator";
import { isStrategyFxMarket } from "@/lib/strategy-language/markets";
import { STRATEGY_EXAMPLES, parseStrategy, type StrategyDiagnostic } from "@/lib/strategy-language/parser";
import type { StrategyReport } from "@/lib/strategy-language/run";

type Source = "dukascopy" | "histdata" | "demo";
type Market = { symbol: string; source: Source; name: string };
const DAY = 86_400_000;
const DRAFT_KEY = "ftl:strategy-lab-draft:v1";
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const money = (value: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value));
const timestamp = (value: string) => Date.parse(`${value}T00:00:00Z`);

function EquityLine({ report }: { report: StrategyReport }) {
  const values = report.equity.map(point => point.balance);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, 1);
  const plotted = report.equity.map((point, index) => ({
    x: 18 + index * (764 / Math.max(1, report.equity.length - 1)),
    y: 126 - (point.balance - low) / span * 100,
  }));
  const line = plotted.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return <div className="rounded-xl border app-border bg-[var(--app-panel-2)]/40 p-3">
    <svg viewBox="0 0 800 150" className="h-44 w-full" role="img" aria-label={`Closed-trade equity from ${money(report.startingBalance)} to ${money(report.endingBalance)}`}>
      <line x1="18" y1="126" x2="782" y2="126" stroke="var(--app-border)" strokeDasharray="4 5" />
      {plotted.length > 1 && <path d={`${line} L782,126 L18,126 Z`} fill="var(--app-accent-wash)" />}
      <path d={line} fill="none" stroke="var(--app-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {plotted.length > 0 && <circle cx={plotted.at(-1)!.x} cy={plotted.at(-1)!.y} r="4" fill="var(--app-accent)" />}
    </svg>
    <div className="flex justify-between gap-3 text-xs app-muted"><span>Starting balance {money(report.startingBalance)}</span><span>{report.trades.length} closed trades</span><span>Ending balance {money(report.endingBalance)}</span></div>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-xl border app-border bg-[var(--app-panel)] p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">{label}</p><p className="mt-2 font-mono text-xl font-semibold tabular-nums">{value}</p>{detail && <p className="mt-1 text-xs app-muted">{detail}</p>}</div>;
}

export function StrategyLab({ sampleMode, maxDays, allowedSymbols }: { sampleMode: boolean; maxDays: number; allowedSymbols: readonly string[] | null }) {
  const [code, setCode] = useState<string>(STRATEGY_EXAMPLES.crossover);
  const [markets, setMarkets] = useState<Market[]>(sampleMode ? [{ symbol: "EURUSD", source: "demo", name: "EUR/USD" }] : []);
  const [market, setMarket] = useState<Market | null>(sampleMode ? { symbol: "EURUSD", source: "demo", name: "EUR/USD" } : null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketSearch, setMarketSearch] = useState("");
  const [from, setFrom] = useState(sampleMode ? date(DEMO_RANGE_START) : "");
  const [through, setThrough] = useState(sampleMode ? date(DEMO_RANGE_END - DAY) : "");
  const [rangeText, setRangeText] = useState(sampleMode ? "Sample period: 1–14 Mar 2024" : "Choose a market to load available history.");
  const [spread, setSpread] = useState("1");
  const [slippage, setSlippage] = useState("0");
  const [commission, setCommission] = useState("0");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverDiagnostics, setServerDiagnostics] = useState<StrategyDiagnostic[]>([]);
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const parsed = useMemo(() => parseStrategy(code), [code]);
  const filteredMarkets = markets.filter(item => `${item.symbol} ${item.name} ${item.source}`.toLowerCase().includes(marketSearch.toLowerCase()));

  useEffect(() => {
    try { const saved = window.localStorage.getItem(DRAFT_KEY); if (saved) setCode(saved); } catch { /* private browsing */ }
  }, []);
  useEffect(() => { try { window.localStorage.setItem(DRAFT_KEY, code); } catch { /* private browsing */ } }, [code]);
  useEffect(() => {
    if (sampleMode) return;
    let active = true;
    Promise.all([fetchSymbols("dukascopy"), fetchSymbols("histdata")]).then(([duka, hist]) => {
      if (!active) return;
      const allowed = allowedSymbols ? new Set<string>(allowedSymbols) : null;
      const available: Market[] = [
        ...duka.filter(item => item.enabled && isStrategyFxMarket(item.symbol) && (!allowed || allowed.has(item.symbol))).map(item => ({ symbol: item.symbol, source: "dukascopy" as const, name: item.displayName })),
        ...hist.filter(item => item.enabled && isStrategyFxMarket(item.symbol) && (!allowed || allowed.has(item.symbol))).map(item => ({ symbol: item.symbol, source: "histdata" as const, name: item.displayName })),
      ];
      setMarkets(available);
      setMarket(available[0] ?? null);
      if (!available.length) setRangeText("No FX markets are available right now.");
    }).catch(() => { if (active) setRangeText("Could not load markets. Refresh to try again."); });
    return () => { active = false; };
  }, [sampleMode, allowedSymbols]);
  useEffect(() => {
    if (!market || sampleMode || market.source === "demo") return;
    let active = true;
    setRangeText("Loading available history…");
    fetchRanges(market.symbol, market.source).then(ranges => {
      if (!active) return;
      const latest = [...ranges].sort((a, b) => b.endTime - a.endTime)[0];
      if (!latest) { setRangeText("No historical range is available for this listing."); setFrom(""); setThrough(""); return; }
      const endDate = date(latest.endTime);
      const startDate = date(Math.max(latest.startTime, latest.endTime - Math.min(maxDays - 1, 29) * DAY));
      setFrom(startDate);
      setThrough(endDate);
      setRangeText(`Available ${date(latest.startTime)} – ${date(latest.endTime)} · ${market.source === "histdata" ? "HistData" : "Dukascopy"}`);
    }).catch(() => { if (active) setRangeText("Could not load available dates."); });
    return () => { active = false; };
  }, [market, sampleMode, maxDays]);
  useEffect(() => { setReport(null); setError(null); setServerDiagnostics([]); }, [code, market, from, through, spread, slippage, commission]);

  const run = async () => {
    if (!parsed.ok || !market || busy) return;
    const startTime = timestamp(from);
    const endTime = timestamp(through) + DAY - 1;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime || endTime - startTime > maxDays * DAY) { setError(`Choose up to ${maxDays} days, with Through on or after From.`); return; }
    setBusy(true); setError(null); setServerDiagnostics([]); setReport(null);
    try {
      const response = await fetch("/api/strategy-tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, symbol: market.symbol, source: market.source, startTime, endTime, startingBalance: 10_000, spreadPips: Number(spread), slippagePips: Number(slippage), commissionPerLot: Number(commission) }) });
      const data = await response.json() as { ok: boolean; report?: StrategyReport; error?: string; diagnostics?: StrategyDiagnostic[] };
      if (!response.ok || !data.report) { setError(data.error ?? "The test could not complete."); setServerDiagnostics(data.diagnostics ?? []); return; }
      setReport(data.report);
      setShowAllTrades(false);
    } catch { setError("Connection lost while running the test. Try again."); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-8 text-[var(--app-text)] sm:px-7 lg:px-10">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-accent-text)]"><Code2 size={15} /> Automation · v1</div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Strategy Lab</h1><p className="mt-2 max-w-2xl text-sm leading-6 app-muted">Write readable rules, run a historical test, then inspect every simulated trade.</p></div>
      <span className="rounded-full border app-border bg-[var(--app-panel)] px-3 py-1.5 text-xs app-muted">One market · one position · closed candles</span>
    </header>
    {sampleMode && <div className="mb-6 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm"><strong>Sample preview.</strong> This run uses synthetic March 2024 candles. <a href="/sign-in?next=%2Fapp%2Fstrategies" className="font-semibold underline underline-offset-2">Sign in</a> to test available historical markets.</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-accent-text)]">01 · Market and period</p><h2 className="mt-1 text-lg font-semibold">Choose the test data</h2></div><span className="text-xs app-muted">Up to {maxDays} days</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_1fr_1fr]">
            <div className="relative"><label className="mb-1.5 block text-xs font-semibold app-muted">Market · provider</label><button type="button" onClick={() => setMarketOpen(!marketOpen)} aria-expanded={marketOpen} className="flex h-11 w-full items-center justify-between rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-left text-sm"><span>{market ? `${market.name} · ${market.source === "demo" ? "Sample" : market.source === "histdata" ? "HistData" : "Dukascopy"}` : "Loading markets…"}</span><ChevronDown size={15} /></button>
              {marketOpen && <div className="absolute left-0 right-0 top-[74px] z-30 max-h-80 overflow-y-auto rounded-xl border app-border bg-[var(--app-panel-solid)] p-2 shadow-xl"><div className="relative mb-2"><Search size={14} className="absolute left-2.5 top-2.5 app-muted" /><input value={marketSearch} onChange={event => setMarketSearch(event.target.value)} placeholder="Search markets" className="h-9 w-full rounded-lg border app-border bg-[var(--app-panel-2)] pl-8 pr-2 text-sm outline-none focus:border-[var(--app-accent)]" /></div>{filteredMarkets.map(item => <button key={`${item.symbol}:${item.source}`} type="button" onClick={() => { setMarket(item); setMarketOpen(false); setMarketSearch(""); }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[var(--app-panel-2)]"><span className="font-semibold">{item.name}</span><span className="text-xs app-muted">{item.source === "demo" ? "Sample" : item.source === "histdata" ? "HistData" : "Dukascopy"}</span></button>)}{!filteredMarkets.length && <p className="p-3 text-sm app-muted">No matching markets.</p>}</div>}
            </div>
            <label className="text-xs font-semibold app-muted">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" /></label>
            <label className="text-xs font-semibold app-muted">Through<input type="date" value={through} onChange={event => setThrough(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" /></label>
          </div>
          <p className="mt-3 text-xs app-muted">{rangeText}</p>
          <button type="button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="mt-4 flex items-center gap-1 text-xs font-semibold text-[var(--app-accent-text)]">Execution assumptions <ChevronDown size={13} className={advanced ? "rotate-180" : ""} /></button>
          {advanced && <div className="mt-3 grid gap-3 sm:grid-cols-3">{([["Spread (pips)", spread, setSpread], ["Slippage (pips)", slippage, setSlippage], ["Commission / lot ($)", commission, setCommission]] as const).map(([label, value, setter]) => <label key={label} className="text-xs app-muted">{label}<input type="number" min="0" step="0.1" value={value} onChange={event => setter(event.target.value)} className="mt-1 h-10 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-sm text-[var(--app-text)]" /></label>)}</div>}
        </section>

        <section className="rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-accent-text)]">02 · Rules</p><h2 className="mt-1 text-lg font-semibold">Write the strategy</h2></div><div className="flex gap-2"><button type="button" onClick={() => setCode(STRATEGY_EXAMPLES.crossover)} className="rounded-lg border app-border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--app-panel-2)]">EMA example</button><button type="button" onClick={() => setCode(STRATEGY_EXAMPLES.pullback)} className="rounded-lg border app-border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--app-panel-2)]">RSI example</button></div></div>
          <div className="mt-5 overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]"><div className="flex items-center justify-between border-b app-border px-3 py-2 text-[11px] app-muted"><span>strategy.ftl</span><span>Draft saved in this browser</span></div><textarea aria-label="Strategy code" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} className="min-h-[290px] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-[var(--app-text)] outline-none" /></div>
          <div className="mt-3 space-y-1" aria-live="polite">{parsed.ok ? <p className="flex items-center gap-1.5 text-xs text-[var(--app-accent-text)]"><Check size={14} /> Rules valid · {parsed.program.signals.length} entry {parsed.program.signals.length === 1 ? "rule" : "rules"} · {parsed.program.timeframe} candles</p> : parsed.diagnostics.map((item, index) => <p key={`${item.line}-${index}`} className="flex items-start gap-1.5 text-xs text-loss"><AlertCircle size={13} className="mt-0.5 shrink-0" /> Line {item.line}: {item.message}</p>)}{serverDiagnostics.map((item, index) => <p key={`server-${index}`} className="text-xs text-loss">Line {item.line}: {item.message}</p>)}</div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-loss">{error}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t app-border pt-5"><p className="max-w-lg text-xs leading-5 app-muted">BUY opens a long; SELL opens a short. Signals evaluate after a candle closes, with entry at the next open. Stops and targets use conservative same-candle ordering.</p><button type="button" onClick={() => void run()} disabled={!parsed.ok || !market || busy} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--app-accent)] px-5 text-sm font-bold text-[var(--app-accent-ink)] hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {busy ? "Running test…" : "Run test"} {!busy && <ArrowRight size={15} />}</button></div>
        </section>

        <section aria-label="Strategy test results" className="rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-accent-text)]">03 · Results</p><h2 className="mt-1 text-lg font-semibold">What the rules produced</h2></div>{report && <span className="rounded-full border app-border px-3 py-1 text-xs app-muted">{report.bars} candles · {report.dataSource === "demo" ? "Sample data" : report.dataSource.toLowerCase().includes("histdata") ? "HistData" : report.dataSource.toLowerCase().includes("dukascopy") ? "Dukascopy" : report.dataSource}</span>}</div>
          {!report ? <div className="mt-5 grid min-h-44 place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/40 px-5 text-center"><div><Sparkles size={19} className="mx-auto text-[var(--app-accent-text)]" /><p className="mt-2 text-sm font-semibold">Your test results will appear here</p><p className="mt-1 text-xs app-muted">Run a valid strategy to see the equity path and each trade.</p></div></div> : <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Net P/L" value={money(report.netPnl)} detail={`${report.trades.length} trades`} /><Metric label="Win rate" value={`${report.winRate.toFixed(1)}%`} detail="Profitable trades / all trades" /><Metric label="Profit factor" value={report.profitFactor === null ? "—" : report.profitFactor.toFixed(2)} detail="Gross profit / gross loss" /><Metric label="Max drawdown" value={money(report.maxDrawdown)} detail="Closed-trade equity" /></div>
            <EquityLine report={report} />
            {report.trades.length ? <div className="overflow-x-auto"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Trade log</h3><span className="text-xs app-muted">Latest first</span></div><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b app-border app-muted"><th className="py-2">#</th><th>Entry · UTC</th><th>Side</th><th>Exit</th><th>Result</th><th>R</th><th>Reason</th></tr></thead><tbody>{[...report.trades].reverse().slice(0, showAllTrades ? undefined : 20).map(trade => <tr key={trade.number} className="border-b app-border"><td className="py-2.5">{trade.number}</td><td>{new Date(trade.entryTime).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })}</td><td className="font-semibold">{trade.direction === "long" ? "Buy" : "Sell"}</td><td>{trade.exitPrice}</td><td className={Number(trade.pnl) >= 0 ? "text-profit" : "text-loss"}>{money(trade.pnl)}</td><td>{trade.r}R</td><td>{trade.reason}{trade.intrabarAmbiguous ? " *" : ""}</td></tr>)}</tbody></table>{report.trades.length > 20 && <button type="button" onClick={() => setShowAllTrades(!showAllTrades)} className="mt-3 text-xs font-semibold text-[var(--app-accent-text)]">{showAllTrades ? "Show latest 20" : `Show all ${report.trades.length} trades`}</button>}</div> : <p className="rounded-lg border app-border p-4 text-sm app-muted">No trades met these rules in the selected period. Try a longer period or inspect the signal conditions.</p>}
            <div className="space-y-1 border-t app-border pt-4 text-xs leading-5 app-muted"><p>Simulated with {report.assumptions.spreadPips} pip spread, {report.assumptions.slippagePips} pip slippage, ${report.assumptions.commissionPerLot} commission per lot, and conservative stop/target ordering. Native bid/ask quotes take precedence over simulated spread when available. * Both stop and target were inside one candle; the stop was assumed first.</p>{report.crossCurrencyApprox && <p>USD conversion for this pair is approximate.</p>}{report.skippedSignals > 0 && <p>{report.skippedSignals} signal(s) were skipped because of conflicting rules or unavailable position sizing.</p>}<p>Historical simulation does not predict live results. Drafts stay in this browser; test reports are not saved to your account.</p></div>
          </div>}
        </section>
      </div>
      <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start"><section className="rounded-2xl border app-border bg-[var(--app-panel)] p-5"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[var(--app-accent-text)]" /><h2 className="font-semibold">Language reference</h2></div><p className="mt-2 text-xs leading-5 app-muted">One instruction per line. Lines beginning with # are comments.</p><div className="mt-4 space-y-3 font-mono text-xs"><div><span className="app-muted">Name and candle size</span><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--app-panel-2)] p-2.5">STRATEGY "My idea"{"\n"}TIMEFRAME 1h</pre></div><div><span className="app-muted">Entry rules</span><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--app-panel-2)] p-2.5">BUY WHEN EMA(9) CROSSES ABOVE EMA(21){"\n"}SELL WHEN RSI(14) BELOW 30</pre></div><div><span className="app-muted">Risk and exit</span><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--app-panel-2)] p-2.5">STOP 20 PIPS{"\n"}TARGET 40 PIPS{"\n"}RISK 1%</pre></div></div><p className="mt-4 text-xs leading-5 app-muted">Indicators: CLOSE, SMA(2–200), EMA(2–200), RSI(2–200). Compare with ABOVE, BELOW, CROSSES ABOVE, or CROSSES BELOW. The right side can also be a number.</p></section><section className="rounded-2xl border app-border bg-[var(--app-panel)] p-5"><h2 className="font-semibold">How this test works</h2><ol className="mt-3 space-y-3 text-xs leading-5 app-muted"><li><strong className="text-[var(--app-text)]">1.</strong> Calculate indicators using only candles that have closed.</li><li><strong className="text-[var(--app-text)]">2.</strong> Enter at the next candle&apos;s open if the account is flat.</li><li><strong className="text-[var(--app-text)]">3.</strong> Size the simulated trade from the stop distance and risk percentage.</li><li><strong className="text-[var(--app-text)]">4.</strong> Check stop and target on each candle; close any remaining trade at the test end.</li></ol><p className="mt-4 text-xs app-muted">This first version tests one FX market and one open position at a time.</p></section></aside>
    </div>
  </div>;
}
