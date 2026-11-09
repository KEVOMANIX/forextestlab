"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Check, ChevronDown, ChevronUp, Code2, Loader2, Maximize2, Minimize2, Play, Search, Settings2 } from "lucide-react";

import { fetchRanges, fetchSymbols } from "@/lib/backtest/client";
import { DEMO_RANGE_END, DEMO_RANGE_START } from "@/lib/market-data/demo-generator";
import { isStrategyFxMarket } from "@/lib/strategy-language/markets";
import { STRATEGY_EXAMPLES, parseStrategy, type StrategyDiagnostic } from "@/lib/strategy-language/parser";
import type { StrategyReport } from "@/lib/strategy-language/run";

const StrategyCodeEditor = dynamic(() => import("./StrategyCodeEditor").then(module => module.StrategyCodeEditor), { ssr: false, loading: () => <div className="grid h-full min-h-[400px] place-items-center bg-[#0b100e] text-sm text-[#a7bcb0]">Loading editor…</div> });
type Source = "dukascopy" | "histdata" | "demo";
type Market = { symbol: string; source: Source; name: string };
type SettingsPane = "market" | "period" | "execution" | null;
type BottomTab = "results" | "problems" | "reference";
type Engine = "ftl" | "pine";
type PineReport = {
  engine: string; symbol: string; timeframe: string; dataSource: string; bars: number;
  startingBalance: number; endingBalance: number; netPnl: number; winRate: number;
  profitFactor: number | null; maxDrawdown: number; openPosition: number;
  equity: { time: number; balance: number }[];
  trades: { number: number; direction: "long" | "short"; entryTime: number; exitTime: number; entryPrice: number; exitPrice: number; quantity: number; pnl: number; entryId: string; exitId: string | null }[];
};
const PINE_EXAMPLE = `//@version=6
strategy("EMA crossover test", overlay=true, initial_capital=10000, default_qty_type=strategy.fixed, default_qty_value=1, margin_long=1, margin_short=1)
fast = ta.ema(close, 3)
slow = ta.ema(close, 7)
goLong = ta.crossover(fast, slow)
goShort = ta.crossunder(fast, slow)
if goLong
    strategy.entry("Long", strategy.long)
if goShort
    strategy.entry("Short", strategy.short)
plot(fast, "Fast EMA")
plot(slow, "Slow EMA")`;
const DAY = 86_400_000;
const DRAFT_KEY = "ftl:strategy-lab-draft:v2";
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const timestamp = (value: string) => Date.parse(`${value}T00:00:00Z`);
const money = (value: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value));
const sourceName = (source: Source) => source === "histdata" ? "HistData" : source === "dukascopy" ? "Dukascopy" : "Sample";

function EquityLine({ report }: { report: StrategyReport }) {
  const balances = report.equity.map(point => point.balance);
  const low = Math.min(...balances);
  const span = Math.max(1, Math.max(...balances) - low);
  const points = report.equity.map((point, index) => `${18 + index * 764 / Math.max(1, report.equity.length - 1)},${126 - (point.balance - low) / span * 100}`);
  return <div className="rounded-lg border app-border p-3"><svg viewBox="0 0 800 150" className="h-40 w-full" role="img" aria-label={`Equity from ${money(report.startingBalance)} to ${money(report.endingBalance)}`}><line x1="18" x2="782" y1="126" y2="126" stroke="var(--app-border)" /><polyline points={points.join(" ")} fill="none" stroke="var(--app-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg><div className="flex justify-between text-xs app-muted"><span>{money(report.startingBalance)} start</span><span>{report.trades.length} trades</span><span>{money(report.endingBalance)} end</span></div></div>;
}

export function StrategyLabWorkspace({ sampleMode, allowedSymbols, pineEnabled = false }: { sampleMode: boolean; allowedSymbols: readonly string[] | null; pineEnabled?: boolean }) {
  const [engine, setEngine] = useState<Engine>("ftl");
  const [code, setCode] = useState<string>(STRATEGY_EXAMPLES.crossover);
  const [ftlDraft, setFtlDraft] = useState<string>(STRATEGY_EXAMPLES.crossover);
  const [pineDraft, setPineDraft] = useState<string>(PINE_EXAMPLE);
  const [pineTimeframe, setPineTimeframe] = useState<"15m" | "1h" | "4h" | "1d">("15m");
  const [legacyDraft, setLegacyDraft] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>(sampleMode ? [{ symbol: "EURUSD", source: "demo", name: "EUR/USD" }, ...(pineEnabled ? [{ symbol: "XAUUSD", source: "demo" as const, name: "XAU/USD" }] : [])] : []);
  const [market, setMarket] = useState<Market | null>(sampleMode ? { symbol: "EURUSD", source: "demo", name: "EUR/USD" } : null);
  const [marketSearch, setMarketSearch] = useState("");
  const [from, setFrom] = useState(sampleMode ? date(DEMO_RANGE_START) : "");
  const [through, setThrough] = useState(sampleMode ? date(DEMO_RANGE_END - DAY) : "");
  const [rangeText, setRangeText] = useState(sampleMode ? "Sample history · Mar 1–14, 2024" : "Loading available history…");
  const [availableRange, setAvailableRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [spread, setSpread] = useState("1");
  const [slippage, setSlippage] = useState("0");
  const [commission, setCommission] = useState("0");
  const [settings, setSettings] = useState<SettingsPane>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("results");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverDiagnostics, setServerDiagnostics] = useState<StrategyDiagnostic[]>([]);
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [pineReport, setPineReport] = useState<PineReport | null>(null);
  const [visibleTrades, setVisibleTrades] = useState(20);
  const parsed = useMemo(() => engine === "ftl" ? parseStrategy(code) : null, [code, engine]);
  const issues = parsed && !parsed.ok ? parsed.diagnostics : [];
  const marketMatches = markets.filter(item => (engine === "pine" ? ["EURUSD", "XAUUSD"].includes(item.symbol) : isStrategyFxMarket(item.symbol)) && `${item.symbol} ${item.name} ${item.source}`.toLowerCase().includes(marketSearch.toLowerCase()));
  const exampleOptions: [string, string][] = engine === "pine"
    ? [["EMA crossover · Pine v6", PINE_EXAMPLE]]
    : [["EMA crossover", STRATEGY_EXAMPLES.crossover], ["RSI pullback", STRATEGY_EXAMPLES.pullback], ...(legacyDraft ? [["Previous draft", legacyDraft] as [string, string]] : [])];

  useEffect(() => {
    try { const saved = localStorage.getItem(DRAFT_KEY); if (saved) { setCode(saved); setFtlDraft(saved); } const pine = localStorage.getItem("ftl:strategy-lab-pine-draft:v1"); if (pine) setPineDraft(pine); setLegacyDraft(localStorage.getItem("ftl:strategy-lab-draft:v1")); } catch { /* browser storage unavailable */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(engine === "pine" ? "ftl:strategy-lab-pine-draft:v1" : DRAFT_KEY, code); } catch { /* browser storage unavailable */ } }, [code, engine]);
  useEffect(() => {
    if (sampleMode) return;
    let active = true;
    Promise.all([fetchSymbols("dukascopy"), fetchSymbols("histdata")]).then(([duka, hist]) => {
      if (!active) return;
      const allowed = allowedSymbols ? new Set(allowedSymbols) : null;
      const available: Market[] = [
        ...duka.filter(item => item.enabled && (isStrategyFxMarket(item.symbol) || (pineEnabled && item.symbol === "XAUUSD")) && (!allowed || allowed.has(item.symbol))).map(item => ({ symbol: item.symbol, source: "dukascopy" as const, name: item.displayName })),
        ...hist.filter(item => item.enabled && (isStrategyFxMarket(item.symbol) || (pineEnabled && item.symbol === "XAUUSD")) && (!allowed || allowed.has(item.symbol))).map(item => ({ symbol: item.symbol, source: "histdata" as const, name: item.displayName })),
      ];
      setMarkets(available);
      setMarket(available[0] ?? null);
      if (!available.length) setRangeText("No supported markets are available right now.");
    }).catch(() => { if (active) setRangeText("Could not load markets. Refresh to try again."); });
    return () => { active = false; };
  }, [sampleMode, allowedSymbols, pineEnabled]);
  useEffect(() => {
    if (!market || market.source === "demo") return;
    let active = true;
    setRangeText("Loading available history…");
    fetchRanges(market.symbol, market.source).then(ranges => {
      if (!active) return;
      const latest = [...ranges].sort((a, b) => b.endTime - a.endTime)[0];
      if (!latest) { setAvailableRange(null); setRangeText("No history for this market."); setFrom(""); setThrough(""); return; }
      setAvailableRange(latest);
      setFrom(date(Math.max(latest.startTime, latest.endTime - 29 * DAY)));
      setThrough(date(latest.endTime));
      setRangeText(`${date(latest.startTime)} – ${date(latest.endTime)} available`);
    }).catch(() => { if (active) setRangeText("Could not load available dates."); });
    return () => { active = false; };
  }, [market]);
  useEffect(() => { setReport(null); setPineReport(null); setError(null); setServerDiagnostics([]); }, [code, market, from, through, spread, slippage, commission, engine, pineTimeframe]);

  const chooseEngine = (next: Engine) => {
    if (next === engine) return;
    if (engine === "ftl") setFtlDraft(code); else setPineDraft(code);
    if (next === "pine" && !["EURUSD", "XAUUSD"].includes(market?.symbol ?? "")) setMarket(markets.find(item => item.symbol === "EURUSD" || item.symbol === "XAUUSD") ?? null);
    if (next === "ftl" && market && !isStrategyFxMarket(market.symbol)) setMarket(markets.find(item => isStrategyFxMarket(item.symbol)) ?? null);
    setCode(next === "pine" ? pineDraft : ftlDraft);
    setEngine(next);
    setExamplesOpen(false);
  };

  const run = async () => {
    if (busy || !market) return;
    if (parsed && !parsed.ok) { setBottomTab("problems"); setBottomOpen(true); return; }
    const startTime = timestamp(from);
    const endTime = timestamp(through) + DAY - 1;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) { setError("Choose valid From and Through dates."); setSettings("period"); return; }
    setBusy(true); setProgress("Starting test…"); setError(null); setReport(null); setServerDiagnostics([]); setBottomOpen(true); setBottomTab("results");
    try {
      if (engine === "pine") {
        const response = await fetch("/api/strategy-tests/pine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, symbol: market.symbol, source: market.source, timeframe: pineTimeframe, startTime, endTime, startingBalance: 10_000 }) });
        const data = await response.json() as { ok: boolean; report?: PineReport; error?: string; diagnostics?: StrategyDiagnostic[] };
        if (!response.ok || !data.ok || !data.report) { setError(data.error ?? "The Pine test could not complete."); setServerDiagnostics(data.diagnostics ?? []); setBottomTab("problems"); return; }
        setPineReport(data.report);
        setVisibleTrades(20);
        return;
      }
      const response = await fetch("/api/strategy-tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, symbol: market.symbol, source: market.source, startTime, endTime, startingBalance: 10_000, spreadPips: Number(spread), slippagePips: Number(slippage), commissionPerLot: Number(commission) }) });
      if (!response.ok) { const data = await response.json() as { error?: string; diagnostics?: StrategyDiagnostic[] }; setError(data.error ?? "The test could not complete."); setServerDiagnostics(data.diagnostics ?? []); setBottomTab("problems"); return; }
      if (!response.body) throw new Error("No test response received.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as { type: string; months?: number; totalMonths?: number; bars?: number; report?: StrategyReport; error?: string };
        if (event.type === "progress") setProgress(`Month ${event.months} of ${event.totalMonths} · ${event.bars?.toLocaleString()} candles`);
        if (event.type === "result" && event.report) { setReport(event.report); setVisibleTrades(20); }
        if (event.type === "error") { setError(event.error ?? "The test could not complete."); setBottomTab("problems"); }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); newline = buffer.indexOf("\n"); }
      }
      if (buffer.trim()) consume(buffer);
    } catch { setError("Connection lost while running the test. Try again."); setBottomTab("problems"); }
    finally { setBusy(false); setProgress(null); }
  };

  const toggleSettings = (pane: SettingsPane) => { setExamplesOpen(false); setSettings(current => current === pane ? null : pane); };
  const chooseTab = (tab: BottomTab) => { setBottomTab(tab); setBottomOpen(true); };

  return <div className={`${focusMode ? "fixed inset-0 z-[120] h-dvh overflow-y-auto" : "min-h-[calc(100dvh-4rem)]"} flex flex-col bg-[var(--app-panel-solid)] text-[var(--app-text)]`}>
    <header className="sticky top-0 z-30 border-b app-border bg-[var(--app-panel-solid)]">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><Code2 size={18} className="shrink-0 text-[var(--app-accent-text)]" /><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xs app-muted">Strategy Lab</span><span className="app-muted">/</span><strong className="truncate text-sm font-semibold">{parsed?.ok ? parsed.program.name : engine === "pine" ? "Pine v6 strategy" : "Untitled strategy"}</strong></div><span className="text-[11px] app-muted">strategy.{engine === "pine" ? "pine" : "ftl"} · Saved in this browser</span></div></div>
        <div className="flex flex-wrap items-center gap-2">
          {pineEnabled && <div className="flex rounded-md border app-border p-0.5 text-xs"><button type="button" onClick={() => chooseEngine("ftl")} className={`rounded px-2.5 py-1.5 ${engine === "ftl" ? "bg-[var(--app-panel-2)] font-semibold" : "app-muted"}`}>FTL Script</button><button type="button" onClick={() => chooseEngine("pine")} className={`rounded px-2.5 py-1.5 ${engine === "pine" ? "bg-[var(--app-panel-2)] font-semibold" : "app-muted"}`}>Pine v6 · experimental</button></div>}
          <div className="relative"><button type="button" onClick={() => { setExamplesOpen(!examplesOpen); setSettings(null); }} aria-expanded={examplesOpen} className="inline-flex h-9 items-center gap-1 rounded-md border app-border px-3 text-xs font-semibold hover:bg-[var(--app-panel-2)]">Examples <ChevronDown size={13} /></button>{examplesOpen && <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl">{exampleOptions.map(([label, example]) => <button key={label} type="button" onClick={() => { setCode(example); setExamplesOpen(false); }} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-[var(--app-panel-2)]">{label}</button>)}</div>}</div>
          <button type="button" onClick={() => chooseTab("reference")} className="hidden h-9 rounded-md border app-border px-3 text-xs font-semibold hover:bg-[var(--app-panel-2)] sm:block">Reference</button>
          <button type="button" onClick={() => setFocusMode(!focusMode)} aria-label={focusMode ? "Exit focus mode" : "Focus mode"} title={focusMode ? "Exit focus mode" : "Focus mode"} className="grid size-9 place-items-center rounded-md border app-border hover:bg-[var(--app-panel-2)]">{focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
          <button type="button" disabled={!market || busy} onClick={() => void run()} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--app-accent)] px-3.5 text-xs font-bold text-[var(--app-accent-ink)] disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {busy ? "Running…" : "Run test"}</button>
        </div>
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-2 border-t app-border px-3 py-1.5 sm:px-5">
        <button type="button" onClick={() => toggleSettings("market")} aria-expanded={settings === "market"} className="inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs hover:bg-[var(--app-panel-2)]"><strong>{market?.symbol ?? "Choose market"}</strong><span className="app-muted">{market ? sourceName(market.source) : ""}</span><ChevronDown size={12} /></button>
        <span className="h-4 w-px bg-[var(--app-border)]" />
        <button type="button" onClick={() => toggleSettings("period")} aria-expanded={settings === "period"} className="inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs hover:bg-[var(--app-panel-2)]">{from || "From"} <span className="app-muted">→</span> {through || "Through"}<ChevronDown size={12} /></button>
        <span className="h-4 w-px bg-[var(--app-border)]" />
        {engine === "pine" ? <label className="text-xs app-muted">Candles <select value={pineTimeframe} onChange={event => setPineTimeframe(event.target.value as "15m" | "1h" | "4h" | "1d")} className="ml-1 rounded border app-border bg-[var(--app-panel-2)] px-2 py-1 text-[var(--app-text)]"><option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1d</option></select></label> : <><span className="px-2 text-xs app-muted">{parsed?.ok ? parsed.program.timeframe : "—"} candles</span><button type="button" onClick={() => toggleSettings("execution")} aria-expanded={settings === "execution"} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs app-muted hover:bg-[var(--app-panel-2)]"><Settings2 size={13} /> Execution</button></>}
        {availableRange && <span className="ml-auto hidden text-[11px] app-muted md:inline">{rangeText}</span>}
      </div>
      {settings && <div className="border-t app-border bg-[var(--app-panel-solid)] px-4 py-4 shadow-lg sm:px-6">
        {settings === "market" && <div className="max-w-xl"><label className="relative block"><Search size={15} className="absolute left-3 top-3 app-muted" /><input value={marketSearch} onChange={event => setMarketSearch(event.target.value)} placeholder="Search markets or providers" className="h-10 w-full rounded-md border app-border bg-[var(--app-panel-2)] pl-9 pr-3 text-sm outline-none" /></label><div className="mt-2 max-h-52 overflow-y-auto">{marketMatches.map(item => <button key={`${item.symbol}:${item.source}`} type="button" onClick={() => { setMarket(item); setSettings(null); setMarketSearch(""); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--app-panel-2)]"><span>{item.name}</span><span className="text-xs app-muted">{sourceName(item.source)}</span></button>)}{!marketMatches.length && <p className="p-3 text-xs app-muted">No matching markets.</p>}</div></div>}
        {settings === "period" && <div className="flex flex-wrap items-end gap-3"><label className="text-xs app-muted">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 block h-10 rounded-md border app-border bg-[var(--app-panel-2)] px-2 text-sm text-[var(--app-text)]" /></label><label className="text-xs app-muted">Through<input type="date" value={through} onChange={event => setThrough(event.target.value)} className="mt-1 block h-10 rounded-md border app-border bg-[var(--app-panel-2)] px-2 text-sm text-[var(--app-text)]" /></label>{availableRange && <button type="button" onClick={() => { setFrom(date(availableRange.startTime)); setThrough(date(availableRange.endTime)); }} className="h-10 rounded-md border app-border px-3 text-xs font-semibold">Use full history</button>}<span className="pb-2 text-xs app-muted">{rangeText}</span></div>}
        {settings === "execution" && <div className="flex flex-wrap gap-3">{([["Spread · pips", spread, setSpread], ["Slippage · pips", slippage, setSlippage], ["Commission · $/lot", commission, setCommission]] as const).map(([label, value, setter]) => <label key={label} className="text-xs app-muted">{label}<input type="number" min="0" step="0.1" value={value} onChange={event => setter(event.target.value)} className="mt-1 block h-10 w-40 rounded-md border app-border bg-[var(--app-panel-2)] px-3 text-sm text-[var(--app-text)]" /></label>)}</div>}
      </div>}
    </header>

    {sampleMode && <div className="border-b border-amber-400/35 bg-amber-400/10 px-4 py-2 text-xs"><strong>Sample data.</strong> Sign in to test real history. <a href="/sign-in?next=%2Fapp%2Fstrategies" className="font-semibold underline">Sign in</a></div>}
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 items-center justify-between border-b border-[#28392f] bg-[#111a14] px-4 text-[11px] text-[#a7bcb0]"><span className="font-mono text-[#e8edea]">strategy.{engine === "pine" ? "pine" : "ftl"}</span><span>{issues.length || serverDiagnostics.length ? <span className="text-[#f2a7a7]">{issues.length + serverDiagnostics.length} {issues.length + serverDiagnostics.length === 1 ? "error" : "errors"}</span> : <span className="text-[#8ee3c7]">{engine === "pine" ? "Compile on run" : "✓ Script valid"}</span>}</span></div>
      <div className={`${focusMode ? "h-[calc(100dvh-194px)]" : "h-[calc(100dvh-320px)]"} min-h-[430px]`}><StrategyCodeEditor value={code} onChange={setCode} serverDiagnostics={serverDiagnostics} mode={engine} /></div>
    </main>

    <section aria-label="Strategy tester" className="border-t app-border bg-[var(--app-panel-solid)]">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 sm:px-5"><div className="flex items-center gap-1">{([ ["results", "Strategy tester"], ["problems", `Problems ${issues.length + serverDiagnostics.length + (error ? 1 : 0)}`], ["reference", "Reference"] ] as [BottomTab, string][]).map(([tab, label]) => <button key={tab} type="button" onClick={() => chooseTab(tab)} className={`h-10 border-b-2 px-3 text-xs font-semibold ${bottomOpen && bottomTab === tab ? "border-[var(--app-accent)] text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"}`}>{label}</button>)}</div><div className="flex items-center gap-3"><span className="text-[11px] app-muted" role="status">{progress ?? (pineReport ? `${pineReport.trades.length} trades · ${money(pineReport.netPnl)}` : report ? `${report.trades.length} trades · ${money(report.netPnl)}` : "Ready")}</span><button type="button" onClick={() => setBottomOpen(!bottomOpen)} aria-label={bottomOpen ? "Collapse bottom panel" : "Open bottom panel"} className="grid size-8 place-items-center rounded-md hover:bg-[var(--app-panel-2)]">{bottomOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button></div></div>
      {bottomOpen && <div className="max-h-[55dvh] overflow-y-auto border-t app-border px-4 py-5 sm:px-6">
        {bottomTab === "problems" && <div className="space-y-2 text-sm">{error && <p role="alert" className="flex gap-2 text-loss"><AlertCircle size={16} />{error}</p>}{[...issues, ...serverDiagnostics].map((issue, index) => <p key={`${issue.line}-${index}`} className="flex gap-2 text-loss"><AlertCircle size={15} className="mt-0.5 shrink-0" />Line {issue.line}: {issue.message}</p>)}{!error && !issues.length && !serverDiagnostics.length && <p className="flex items-center gap-2 text-[var(--app-accent-text)]"><Check size={16} />No script errors.</p>}</div>}
        {bottomTab === "reference" && (engine === "pine" ? <div className="max-w-3xl text-xs"><h3 className="font-semibold">Pine v6 · experimental</h3><p className="mt-2 app-muted">Paste a Pine v6 strategy script. The chart timeframe comes from the selector above. This integration supports EUR/USD and XAU/USD with 15m, 1h, 4h, and 1d candles, up to 30,000 per test. It uses the script&apos;s order settings and the Resin broker emulator; the FTL spread, slippage, and commission controls do not apply here. ForexTestLab&apos;s gold feed is different from FOREXCOM, so fill prices and totals will differ. Third-party scripts and TradingView parity are not yet verified.</p></div> : <div className="grid max-w-5xl gap-6 text-xs sm:grid-cols-3"><div><h3 className="font-semibold">Indicators</h3><pre className="mt-2 whitespace-pre-wrap font-mono app-muted">fast = ta.ema(close, 9){"\n"}slow = ta.sma(close, 21){"\n"}rsi = ta.rsi(close, 14)</pre></div><div><h3 className="font-semibold">Signals</h3><pre className="mt-2 whitespace-pre-wrap font-mono app-muted">longSignal = ta.crossover(fast, slow){"\n"}if longSignal{"\n"}    strategy.entry(&quot;Long&quot;, strategy.long)</pre></div><div><h3 className="font-semibold">Risk and exit</h3><pre className="mt-2 whitespace-pre-wrap font-mono app-muted">strategy(&quot;My idea&quot;, timeframe=&quot;1h&quot;, risk_percent=1){"\n"}strategy.exit(&quot;Exit&quot;, stop_pips=20, take_profit_pips=40)</pre><p className="mt-2 app-muted">FTL Script supports a Pine-inspired subset; unsupported commands show line errors.</p></div></div>)}
        {bottomTab === "results" && engine === "pine" && (pineReport ? <div className="space-y-4"><div><h2 className="text-base font-semibold">Pine v6 test · {pineReport.symbol}</h2><p className="text-xs app-muted">{pineReport.engine} · {pineReport.bars.toLocaleString()} {pineReport.timeframe} candles · {pineReport.dataSource}</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([["Net P/L", money(pineReport.netPnl)], ["Win rate", `${pineReport.winRate.toFixed(1)}%`], ["Profit factor", pineReport.profitFactor?.toFixed(2) ?? "—"], ["Max drawdown", money(pineReport.maxDrawdown)]] as [string, string][]).map(([label, value]) => <div key={label} className="rounded-lg border app-border p-3"><p className="text-[11px] uppercase tracking-wide app-muted">{label}</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p></div>)}</div><p className="text-xs app-muted">{pineReport.trades.length} closed trades · Open position: {pineReport.openPosition} units · Realized equity only</p><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr className="border-b app-border app-muted"><th className="py-2">#</th><th>Entry · UTC</th><th>Side</th><th>Entry</th><th>Exit</th><th>Quantity</th><th>P/L</th></tr></thead><tbody>{[...pineReport.trades].reverse().slice(0, visibleTrades).map(trade => <tr key={trade.number} className="border-b app-border"><td className="py-2">{trade.number}</td><td>{new Date(trade.entryTime).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })}</td><td>{trade.direction === "long" ? "Buy" : "Sell"}</td><td>{trade.entryPrice}</td><td>{trade.exitPrice}</td><td>{trade.quantity}</td><td className={trade.pnl >= 0 ? "text-profit" : "text-loss"}>{money(trade.pnl)}</td></tr>)}</tbody></table>{pineReport.trades.length > visibleTrades && <button type="button" onClick={() => setVisibleTrades(count => count + 100)} className="mt-3 text-xs font-semibold text-[var(--app-accent-text)]">Show 100 more</button>}</div><p className="text-[11px] app-muted">Experimental Pine compatibility. Results may differ from TradingView. Reports are not saved to your account.</p></div> : <p className="py-8 text-center text-sm app-muted">Run a Pine v6 strategy to see its trades and results.</p>)}
        {bottomTab === "results" && engine === "ftl" && (!report ? <div className="grid min-h-28 place-items-center text-center"><div><p className="text-sm font-semibold">{busy ? "Testing your strategy…" : "Run the script to see results"}</p><p className="mt-1 text-xs app-muted">Equity, profit factor, win rate, drawdown, and every simulated trade appear here.</p></div></div> : <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold">{report.name}</h2><p className="text-xs app-muted">{report.bars.toLocaleString()} candles · {report.dataSource}</p></div><span className="text-xs app-muted">{report.assumptions.executionPolicy} execution</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([["Net P/L", money(report.netPnl)], ["Win rate", `${report.winRate.toFixed(1)}%`], ["Profit factor", report.profitFactor?.toFixed(2) ?? "—"], ["Max drawdown", money(report.maxDrawdown)]] as [string, string][]).map(([label, value]) => <div key={label} className="rounded-lg border app-border p-3"><p className="text-[11px] uppercase tracking-wide app-muted">{label}</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p></div>)}</div><EquityLine report={report} /><div className="overflow-x-auto"><h3 className="mb-2 text-sm font-semibold">Trade log · latest first</h3>{report.trades.length ? <><table className="w-full min-w-[600px] text-left text-xs"><thead><tr className="border-b app-border app-muted"><th className="py-2">#</th><th>Entry · UTC</th><th>Side</th><th>Exit</th><th>P/L</th><th>R</th><th>Reason</th></tr></thead><tbody>{[...report.trades].reverse().slice(0, visibleTrades).map(trade => <tr key={trade.number} className="border-b app-border"><td className="py-2">{trade.number}</td><td>{new Date(trade.entryTime).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })}</td><td>{trade.direction === "long" ? "Buy" : "Sell"}</td><td>{trade.exitPrice}</td><td className={Number(trade.pnl) >= 0 ? "text-profit" : "text-loss"}>{money(trade.pnl)}</td><td>{trade.r}R</td><td>{trade.reason}</td></tr>)}</tbody></table>{report.trades.length > visibleTrades && <button type="button" onClick={() => setVisibleTrades(count => count + 100)} className="mt-3 text-xs font-semibold text-[var(--app-accent-text)]">Show 100 more</button>}</> : <p className="text-xs app-muted">No trades matched this period.</p>}</div><p className="text-[11px] app-muted">Historical simulation does not predict live results. Stops and targets use conservative same-candle ordering. Reports are not saved to your account.</p></div>)}
      </div>}
    </section>
  </div>;
}
