"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, ChevronDown, ChevronUp, Loader2, Maximize2, Minimize2, Play, Search } from "lucide-react";

import { useAppTheme } from "@/components/app/ThemeContext";
import { fetchRanges, fetchSymbols } from "@/lib/backtest/client";
import { DEMO_RANGE_END, DEMO_RANGE_START } from "@/lib/market-data/demo-generator";
import { isStrategyFxMarket } from "@/lib/strategy-language/markets";
import { readPineScripts, savePineScript } from "@/lib/chart/pine-scripts";
import { maxDrawdownPercent, sampleEquity, savePineResult } from "@/lib/chart/pine-results";
import type { StrategyDiagnostic } from "@/lib/strategy-language/parser";
import type { LabCandles, LabPlot, LabTrade } from "./StrategyLabChart";
import { useLabDialog } from "./LabDialog";

const StrategyCodeEditor = dynamic(() => import("./StrategyCodeEditor").then(module => module.StrategyCodeEditor), { ssr: false, loading: () => <div className="grid h-full min-h-[300px] place-items-center bg-[var(--code-bg)] text-sm text-[var(--code-muted)]">Loading editor…</div> });
const StrategyLabChart = dynamic(() => import("./StrategyLabChart").then(module => module.StrategyLabChart), { ssr: false });
const StrategyEquityChart = dynamic(() => import("./StrategyLabChart").then(module => module.StrategyEquityChart), { ssr: false });
type Source = "dukascopy" | "histdata" | "demo";
type Market = { symbol: string; source: Source; name: string };
type SettingsPane = "market" | "period" | null;
type TesterTab = "overview" | "performance" | "trades" | "problems" | "properties";
type LabTimeframe = "15m" | "1h" | "4h" | "1d";
type PineReport = {
  kind: "strategy";
  engine: string; symbol: string; timeframe: string; dataSource: string; bars: number;
  startingBalance: number; endingBalance: number; netPnl: number; winRate: number;
  profitFactor: number | null; maxDrawdown: number; openPosition: number;
  equity: { time: number; balance: number }[];
  trades: LabTrade[];
  overlay?: boolean; plots?: LabPlot[]; candles?: LabCandles;
};
type IndicatorReport = {
  kind: "indicator"; engine: string; symbol: string; timeframe: string; dataSource: string; bars: number;
  overlay: boolean; times: number[]; close: number[];
  plots: LabPlot[]; candles?: LabCandles;
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
plot(fast, "Fast EMA", color=color.blue)
plot(slow, "Slow EMA", color=color.orange)`;
const DAY = 86_400_000;
const EDITOR_WIDTH_KEY = "ftl:strategy-lab-editor-width:v1";
const EDITOR_MIN = 320;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const timestamp = (value: string) => Date.parse(`${value}T00:00:00Z`);
const money = (value: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value));
const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
const pineMoney = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 6 : 2,
  maximumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 6 : 2,
}).format(value);
const percent = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
const sourceName = (source: Source) => source === "histdata" ? "HistData" : source === "dukascopy" ? "Dukascopy" : "Sample";
const pricePrecision = (symbol: string) => symbol === "XAUUSD" ? 2 : symbol.endsWith("JPY") ? 3 : 5;
const tone = (value: number) => value > 0 ? "text-profit" : value < 0 ? "text-loss" : "";

type TradeStats = { net: number; grossProfit: number; grossLoss: number; profitFactor: number | null; count: number; wins: number; losses: number; winRate: number; average: number; averageWin: number; averageLoss: number; ratio: number | null; largestWin: number; largestLoss: number; streak: number; averageBars: number | null };
function tradeStats(trades: LabTrade[], barMs: number): TradeStats {
  const wins = trades.filter(trade => trade.pnl > 0), losses = trades.filter(trade => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0), grossLoss = -losses.reduce((sum, trade) => sum + trade.pnl, 0);
  let streak = 0, run = 0;
  for (const trade of trades) { run = trade.pnl < 0 ? run + 1 : 0; streak = Math.max(streak, run); }
  const averageWin = wins.length ? grossProfit / wins.length : 0, averageLoss = losses.length ? grossLoss / losses.length : 0;
  return {
    net: grossProfit - grossLoss, grossProfit, grossLoss, profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    count: trades.length, wins: wins.length, losses: losses.length, winRate: trades.length ? wins.length / trades.length * 100 : 0,
    average: trades.length ? (grossProfit - grossLoss) / trades.length : 0, averageWin, averageLoss, ratio: averageLoss > 0 ? averageWin / averageLoss : null,
    largestWin: wins.length ? Math.max(...wins.map(trade => trade.pnl)) : 0, largestLoss: losses.length ? Math.min(...losses.map(trade => trade.pnl)) : 0,
    streak, averageBars: trades.length ? trades.reduce((sum, trade) => sum + (trade.exitTime - trade.entryTime), 0) / trades.length / barMs : null,
  };
}
/** Largest fall from a peak of realized equity, in money and as a share of that peak. */
function drawdownOf(equity: { balance: number }[]) {
  let peak = -Infinity, amount = 0, share = 0;
  for (const point of equity) { peak = Math.max(peak, point.balance); const fall = peak - point.balance; if (fall > amount) { amount = fall; share = peak > 0 ? fall / peak * 100 : 0; } }
  return { amount, share };
}
const BAR_MS: Record<LabTimeframe, number> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": DAY };

function Kpi({ label, value, detail, valueClass = "" }: { label: string; value: string; detail?: string; valueClass?: string }) {
  return <div className="rounded-lg border app-border px-3 py-2.5"><p className="text-[10.5px] uppercase tracking-wide app-muted">{label}</p><p className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>{detail && <p className="text-[11px] app-muted">{detail}</p>}</div>;
}

function Overview({ report, timeframe, theme }: { report: PineReport; timeframe: LabTimeframe; theme: "dark" | "light" }) {
  const stats = useMemo(() => tradeStats(report.trades, BAR_MS[timeframe]), [report.trades, timeframe]);
  const drawdown = useMemo(() => drawdownOf(report.equity), [report.equity]);
  const longs = report.trades.filter(trade => trade.direction === "long").length;
  return <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
    <div className="grid shrink-0 grid-cols-2 content-start gap-2 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-2">
      <Kpi label="Net profit" value={signedMoney(report.netPnl)} detail={percent(report.netPnl / report.startingBalance * 100)} valueClass={tone(report.netPnl)} />
      <Kpi label="Total trades" value={String(stats.count)} detail={`${longs} long · ${stats.count - longs} short`} />
      <Kpi label="Win rate" value={`${stats.winRate.toFixed(1)}%`} detail={`${stats.wins} / ${stats.count}`} />
      <Kpi label="Profit factor" value={stats.profitFactor?.toFixed(2) ?? "—"} detail={stats.ratio ? `Avg win/loss ${stats.ratio.toFixed(2)}` : undefined} />
      <Kpi label="Max drawdown" value={drawdown.amount ? `−${money(drawdown.amount)}` : money(0)} detail={drawdown.share ? `−${drawdown.share.toFixed(2)}%` : undefined} valueClass={drawdown.amount ? "text-loss" : ""} />
      <Kpi label="Avg trade" value={signedMoney(stats.average)} detail={stats.averageBars != null ? `${Math.round(stats.averageBars)} bars held` : undefined} valueClass={tone(stats.average)} />
    </div>
    <div className="flex min-h-[200px] min-w-0 flex-1 flex-col rounded-lg border app-border">
      <div className="flex items-center justify-between border-b app-border px-3 py-2 text-xs"><strong>Equity</strong><span className="app-muted"><span className="text-[var(--app-accent-text)]">━</span> Realized equity <span className="ml-2 text-loss">▮</span> Drawdown</span></div>
      <div className="relative min-h-0 flex-1">{report.equity.length > 1 ? <StrategyEquityChart equity={report.equity} startingBalance={report.startingBalance} timeframe={timeframe} theme={theme} /> : <p className="p-4 text-xs app-muted">No equity points.</p>}</div>
    </div>
  </div>;
}

function Performance({ report, timeframe }: { report: PineReport; timeframe: LabTimeframe }) {
  const columns = useMemo(() => {
    const barMs = BAR_MS[timeframe];
    return [tradeStats(report.trades, barMs), tradeStats(report.trades.filter(trade => trade.direction === "long"), barMs), tradeStats(report.trades.filter(trade => trade.direction === "short"), barMs)];
  }, [report.trades, timeframe]);
  const drawdown = drawdownOf(report.equity);
  const rows: [string, (stats: TradeStats) => string, ((stats: TradeStats) => string)?][] = [
    ["Net profit", stats => signedMoney(stats.net), stats => tone(stats.net)],
    ["Gross profit", stats => money(stats.grossProfit)],
    ["Gross loss", stats => stats.grossLoss ? `−${money(stats.grossLoss)}` : money(0)],
    ["Profit factor", stats => stats.profitFactor?.toFixed(3) ?? "—"],
    ["Total closed trades", stats => String(stats.count)],
    ["Winning trades", stats => String(stats.wins)],
    ["Losing trades", stats => String(stats.losses)],
    ["Percent profitable", stats => `${stats.winRate.toFixed(2)}%`],
    ["Avg trade", stats => signedMoney(stats.average), stats => tone(stats.average)],
    ["Avg winning trade", stats => money(stats.averageWin)],
    ["Avg losing trade", stats => stats.averageLoss ? `−${money(stats.averageLoss)}` : money(0)],
    ["Ratio avg win / avg loss", stats => stats.ratio?.toFixed(3) ?? "—"],
    ["Largest winning trade", stats => money(stats.largestWin)],
    ["Largest losing trade", stats => stats.largestLoss ? `−${money(Math.abs(stats.largestLoss))}` : money(0)],
    ["Max consecutive losses", stats => String(stats.streak)],
    ["Avg bars in trades", stats => stats.averageBars != null ? String(Math.round(stats.averageBars)) : "—"],
  ];
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs"><span className="app-muted">Starting balance <strong className="font-mono text-[var(--app-text)]">{money(report.startingBalance)}</strong></span><span className="app-muted">Ending balance <strong className="font-mono text-[var(--app-text)]">{money(report.endingBalance)}</strong></span><span className="app-muted">Max drawdown <strong className="font-mono text-loss">{drawdown.amount ? `−${money(drawdown.amount)} (${drawdown.share.toFixed(2)}%)` : money(0)}</strong></span><span className="app-muted">Open position <strong className="font-mono text-[var(--app-text)]">{report.openPosition} units</strong></span></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b app-border app-muted"><th className="py-2 font-medium">Metric</th><th className="text-right font-medium">All</th><th className="text-right font-medium">Long</th><th className="text-right font-medium">Short</th></tr></thead><tbody>{rows.map(([label, value, color]) => <tr key={label} className="border-b app-border"><td className="py-1.5 app-muted">{label}</td>{columns.map((stats, index) => <td key={index} className={`text-right font-mono tabular-nums ${color?.(stats) ?? ""}`}>{value(stats)}</td>)}</tr>)}</tbody></table></div>
  </div>;
}

function TradeList({ report, visibleTrades, onMore, focusTrade, onFocus }: { report: PineReport; visibleTrades: number; onMore: () => void; focusTrade: number | null; onFocus: (trade: number) => void }) {
  const [timeZone, setTimeZone] = useState<"UTC" | "America/New_York">("America/New_York");
  const formatter = useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" }), [timeZone]);
  const price = (value: number) => value.toFixed(pricePrecision(report.symbol));
  let cumulative = 0;
  const totals = new Map(report.trades.map(trade => [trade.number, (cumulative += trade.pnl)]));
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="app-muted">{report.trades.length} closed trades · newest first · click a trade to see it on the chart</span><label className="app-muted">Times <select value={timeZone} onChange={event => setTimeZone(event.target.value as "UTC" | "America/New_York")} className="ml-1 rounded border app-border bg-[var(--app-panel-2)] px-2 py-1 text-[var(--app-text)]"><option value="America/New_York">New York</option><option value="UTC">UTC</option></select></label></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-xs"><thead><tr className="border-b app-border app-muted"><th className="py-2 font-medium">#</th><th className="font-medium">Side</th><th className="font-medium">Entry time</th><th className="font-medium">Entry</th><th className="font-medium">Exit time</th><th className="font-medium">Exit</th><th className="font-medium">Qty</th><th className="text-right font-medium">P/L</th><th className="pr-2 text-right font-medium">Cumulative</th></tr></thead>
      <tbody>{[...report.trades].reverse().slice(0, visibleTrades).map(trade => <tr key={trade.number} onClick={() => onFocus(trade.number)} className={`cursor-pointer border-b app-border hover:bg-[var(--app-panel-2)] ${focusTrade === trade.number ? "bg-[var(--app-panel-2)]" : ""}`}>
        <td className="py-1.5">{trade.number}</td><td className={trade.direction === "long" ? "text-[var(--lab-long)]" : "text-[var(--lab-short)]"}>{trade.direction === "long" ? "Long" : "Short"}</td>
        <td>{formatter.format(new Date(trade.entryTime))}</td><td className="font-mono tabular-nums">{price(trade.entryPrice)}</td>
        <td>{formatter.format(new Date(trade.exitTime))}</td><td className="font-mono tabular-nums">{price(trade.exitPrice)}</td><td>{trade.quantity}</td>
        <td className={`text-right font-mono tabular-nums ${tone(trade.pnl)}`}>{pineMoney(trade.pnl)}</td><td className={`pr-2 text-right font-mono tabular-nums ${tone(totals.get(trade.number) ?? 0)}`}>{pineMoney(totals.get(trade.number) ?? 0)}</td>
      </tr>)}</tbody></table>{report.trades.length > visibleTrades && <button type="button" onClick={onMore} className="mt-3 text-xs font-semibold text-[var(--app-accent-text)]">Show 100 more</button>}</div>
  </div>;
}

export function StrategyLabWorkspace({ sampleMode, allowedSymbols }: { sampleMode: boolean; allowedSymbols: readonly string[] | null }) {
  const { theme } = useAppTheme();
  const router = useRouter();
  const dialogs = useLabDialog();
  const [renaming, setRenaming] = useState(false);
  const [code, setCode] = useState<string>(PINE_EXAMPLE);
  const [pineTimeframe, setPineTimeframe] = useState<LabTimeframe>("15m");
  const [markets, setMarkets] = useState<Market[]>(sampleMode ? [{ symbol: "EURUSD", source: "demo", name: "EUR/USD" }] : []);
  const [market, setMarket] = useState<Market | null>(sampleMode ? { symbol: "EURUSD", source: "demo", name: "EUR/USD" } : null);
  const [marketSearch, setMarketSearch] = useState("");
  const [from, setFrom] = useState(sampleMode ? date(DEMO_RANGE_START) : "");
  const [through, setThrough] = useState(sampleMode ? date(DEMO_RANGE_END - DAY) : "");
  const [rangeText, setRangeText] = useState(sampleMode ? "Sample history · Mar 1–14, 2024" : "Loading available history…");
  const [availableRange, setAvailableRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [settings, setSettings] = useState<SettingsPane>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [testerOpen, setTesterOpen] = useState(true);
  const [testerTab, setTesterTab] = useState<TesterTab>("overview");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverDiagnostics, setServerDiagnostics] = useState<StrategyDiagnostic[]>([]);
  const [pineReport, setPineReport] = useState<PineReport | IndicatorReport | null>(null);
  const [ranTimeframe, setRanTimeframe] = useState<LabTimeframe>("15m");
  const [visibleTrades, setVisibleTrades] = useState(20);
  const [focusTrade, setFocusTrade] = useState<number | null>(null);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState("");
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [editorWidth, setEditorWidth] = useState(440);
  const bodyRef = useRef<HTMLDivElement>(null);
  const marketMatches = markets.filter(item => `${item.symbol} ${item.name} ${item.source}`.toLowerCase().includes(marketSearch.toLowerCase()));
  const problemCount = serverDiagnostics.length + (error ? 1 : 0);
  const declaredName = /^\s*(?:strategy|indicator)\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/m.exec(code)?.[1];
  const title = scriptName || declaredName || "Untitled script";

  useEffect(() => {
    try { const pine = localStorage.getItem("ftl:strategy-lab-pine-draft:v1"); if (pine) setCode(pine); } catch { /* browser storage unavailable */ }
    try { const width = Number(localStorage.getItem(EDITOR_WIDTH_KEY)); if (width >= EDITOR_MIN) setEditorWidth(width); } catch { /* default width */ }
    const selected = new URLSearchParams(window.location.search).get("script");
    const script = readPineScripts().find(item => item.id === selected);
    if (script) { setCode(script.code); setScriptId(script.id); setScriptName(script.name); setSavedCode(script.code); }
  }, []);
  useEffect(() => { try { localStorage.setItem("ftl:strategy-lab-pine-draft:v1", code); } catch { /* browser storage unavailable */ } }, [code]);
  useEffect(() => {
    if (sampleMode) return;
    let active = true;
    Promise.all([fetchSymbols("dukascopy"), fetchSymbols("histdata")]).then(([duka, hist]) => {
      if (!active) return;
      const allowed = allowedSymbols ? new Set(allowedSymbols) : null;
      const available: Market[] = [
        ...duka.filter(item => item.enabled && (isStrategyFxMarket(item.symbol) || item.symbol === "XAUUSD") && (!allowed || allowed.has(item.symbol))).map(item => ({ symbol: item.symbol, source: "dukascopy" as const, name: item.displayName })),
        ...hist.filter(item => item.enabled && (isStrategyFxMarket(item.symbol) || item.symbol === "XAUUSD") && (!allowed || allowed.has(item.symbol))).map(item => ({ symbol: item.symbol, source: "histdata" as const, name: item.displayName })),
      ];
      setMarkets(available);
      setMarket(available[0] ?? null);
      if (!available.length) setRangeText("No supported markets are available right now.");
    }).catch(() => { if (active) setRangeText("Could not load markets. Refresh to try again."); });
    return () => { active = false; };
  }, [sampleMode, allowedSymbols]);
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
  // A changed setup makes the last result stale; the code is kept on the chart until the next run.
  useEffect(() => { setPineReport(null); setError(null); setServerDiagnostics([]); setFocusTrade(null); }, [market, from, through, pineTimeframe]);

  const run = async () => {
    if (busy || !market) return;
    const startTime = timestamp(from);
    const endTime = timestamp(through) + DAY - 1;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) { setError("Choose valid From and Through dates."); setSettings("period"); return; }
    setBusy(true); setProgress("Running test…"); setError(null); setServerDiagnostics([]); setTesterOpen(true);
    try {
      const response = await fetch("/api/strategy-tests/pine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, symbol: market.symbol, source: market.source, timeframe: pineTimeframe, startTime, endTime, startingBalance: 10_000 }) });
      const data = await response.json() as { ok: boolean; report?: PineReport | IndicatorReport; error?: string; diagnostics?: StrategyDiagnostic[] };
      if (!response.ok || !data.ok || !data.report) { setError(data.error ?? "The Pine test could not complete."); setServerDiagnostics(data.diagnostics ?? []); setTesterTab("problems"); return; }
      setPineReport(data.report);
      setRanTimeframe(pineTimeframe);
      const report = data.report;
      if (scriptId && report.kind === "strategy") {
        const balances = report.equity.map(point => point.balance);
        savePineResult(scriptId, {
          ranAt: Date.now(), symbol: report.symbol, timeframe: pineTimeframe, from, through,
          netPnl: report.netPnl, netPercent: report.netPnl / report.startingBalance * 100, profitFactor: report.profitFactor,
          winRate: report.winRate, trades: report.trades.length, maxDrawdownPercent: maxDrawdownPercent(balances), equity: sampleEquity(balances),
        });
      }
      setVisibleTrades(20);
      setFocusTrade(null);
      setTesterTab(current => current === "problems" ? "overview" : current);
    } catch { setError("Connection lost while running the test. Try again."); setTesterTab("problems"); }
    finally { setBusy(false); setProgress(null); }
  };

  const persist = (name: string, scriptCode: string) => {
    const id = scriptId ?? crypto.randomUUID();
    savePineScript({ id, name, code: scriptCode, updatedAt: Date.now() });
    setScriptId(id); setScriptName(name);
  };
  const save = () => { persist(title, code); setSavedCode(code); };
  // Renaming keeps the last saved code; unsaved edits stay unsaved.
  const rename = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (!name || name === title) return;
    persist(name, savedCode ?? code);
    if (savedCode === null) setSavedCode(code);
  };
  const leave = async (event: React.MouseEvent) => {
    if (savedCode === code) return;
    event.preventDefault();
    if (await dialogs.confirm({ title: "Leave without saving?", message: "Your latest code changes haven't been saved.", confirmLabel: "Leave" })) router.push("/app/strategies");
  };
  const toggleSettings = (pane: SettingsPane) => setSettings(current => current === pane ? null : pane);
  const chooseTab = (tab: TesterTab) => { setTesterTab(tab); setTesterOpen(true); };
  const resizeEditor = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = editorWidth;
    const limit = Math.max(EDITOR_MIN, (bodyRef.current?.clientWidth ?? 1200) - 420);
    let latest = startWidth;
    const move = (moveEvent: PointerEvent) => { latest = Math.min(limit, Math.max(EDITOR_MIN, startWidth + startX - moveEvent.clientX)); setEditorWidth(latest); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); try { localStorage.setItem(EDITOR_WIDTH_KEY, String(latest)); } catch { /* width is a convenience */ } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const strategy = pineReport?.kind === "strategy" ? pineReport : null;
  const chartPlots = pineReport?.plots ?? [];
  const chartOverlay = pineReport ? (pineReport.kind === "indicator" ? pineReport.overlay : pineReport.overlay ?? true) : true;
  const statusText = progress ?? (strategy ? `${strategy.trades.length} trades · ${signedMoney(strategy.netPnl)}` : pineReport ? `${chartPlots.length} plots · ${pineReport.bars.toLocaleString()} candles` : "Ready");
  const tabs: [TesterTab, string][] = strategy
    ? [["overview", "Overview"], ["performance", "Performance summary"], ["trades", "List of trades"], ["problems", `Problems${problemCount ? ` ${problemCount}` : ""}`], ["properties", "Properties"]]
    : [["overview", "Overview"], ["problems", `Problems${problemCount ? ` ${problemCount}` : ""}`], ["properties", "Properties"]];
  const activeTab = tabs.some(([tab]) => tab === testerTab) ? testerTab : "overview";

  return <div className={`${focusMode ? "fixed inset-0 z-[120] h-dvh" : "min-h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)]"} flex flex-col bg-[var(--app-panel-solid)] text-[var(--app-text)]`}>
    {dialogs.dialog}
    <header className="relative z-30 shrink-0 border-b app-border bg-[var(--app-panel-solid)]">
      <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-1.5 sm:px-4">
        <a href="/app/strategies" onClick={event => void leave(event)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"><ArrowLeft size={15} />My strategies</a><span className="app-muted">/</span>
        {renaming
          ? <input autoFocus defaultValue={title} maxLength={80} aria-label="Strategy name" onFocus={event => event.currentTarget.select()} onBlur={event => rename(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false); }} className="h-8 w-56 rounded-md border border-[var(--app-accent)] bg-[var(--app-panel-2)] px-2 text-sm font-semibold text-[var(--app-text)] outline-none selection:bg-[var(--app-accent)] selection:text-[var(--app-accent-ink)]" />
          : <button type="button" onClick={() => setRenaming(true)} title="Rename" className="max-w-[16rem] truncate rounded px-1 text-sm font-semibold hover:bg-[var(--app-panel-2)]">{title}</button>}
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${savedCode === code ? "bg-[var(--app-accent)]/15 text-[var(--app-accent-text)]" : "bg-[var(--app-panel-2)] app-muted"}`}>{savedCode === code ? "Saved" : scriptId ? "Unsaved changes" : "Draft"}</span>
        <span className="mx-1 hidden h-4 w-px bg-[var(--app-border)] sm:block" />
        <button type="button" onClick={() => toggleSettings("market")} aria-expanded={settings === "market"} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--app-panel-2)] px-2.5 text-xs"><strong>{market?.symbol ?? "Choose market"}</strong><span className="app-muted">{market ? sourceName(market.source) : ""}</span><ChevronDown size={12} /></button>
        <select value={pineTimeframe} onChange={event => setPineTimeframe(event.target.value as LabTimeframe)} aria-label="Candles" className="h-8 rounded-md border-0 bg-[var(--app-panel-2)] px-2 text-xs text-[var(--app-text)]"><option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1d</option></select>
        <button type="button" onClick={() => toggleSettings("period")} aria-expanded={settings === "period"} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--app-panel-2)] px-2.5 text-xs">{from || "From"} <span className="app-muted">→</span> {through || "Through"}<ChevronDown size={12} /></button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={save} className="h-8 rounded-md border app-border px-3 text-xs font-semibold hover:bg-[var(--app-panel-2)]">Save</button>
          <button type="button" onClick={() => setFocusMode(!focusMode)} aria-label={focusMode ? "Exit focus mode" : "Focus mode"} title={focusMode ? "Exit focus mode" : "Focus mode"} className="grid size-8 place-items-center rounded-md border app-border hover:bg-[var(--app-panel-2)]">{focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
          <button type="button" disabled={!market || busy} onClick={() => void run()} className="inline-flex h-8 items-center gap-2 rounded-md bg-[var(--app-accent)] px-3.5 text-xs font-bold text-[var(--app-accent-ink)] disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {busy ? "Running…" : "Run test"}</button>
        </div>
      </div>
      {settings && <div className="absolute inset-x-0 top-full border-y app-border bg-[var(--app-panel-solid)] px-4 py-4 shadow-xl sm:px-6">
        {settings === "market" && <div className="max-w-xl"><label className="relative block"><Search size={15} className="absolute left-3 top-3 app-muted" /><input autoFocus value={marketSearch} onChange={event => setMarketSearch(event.target.value)} placeholder="Search markets or providers" className="h-10 w-full rounded-md border app-border bg-[var(--app-panel-2)] pl-9 pr-3 text-sm outline-none" /></label><div className="mt-2 max-h-52 overflow-y-auto">{marketMatches.map(item => <button key={`${item.symbol}:${item.source}`} type="button" onClick={() => { setMarket(item); setSettings(null); setMarketSearch(""); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--app-panel-2)]"><span>{item.name}</span><span className="text-xs app-muted">{sourceName(item.source)}</span></button>)}{!marketMatches.length && <p className="p-3 text-xs app-muted">No matching markets.</p>}</div></div>}
        {settings === "period" && <div className="flex flex-wrap items-end gap-3"><label className="text-xs app-muted">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 block h-10 rounded-md border app-border bg-[var(--app-panel-2)] px-2 text-sm text-[var(--app-text)]" /></label><label className="text-xs app-muted">Through<input type="date" value={through} onChange={event => setThrough(event.target.value)} className="mt-1 block h-10 rounded-md border app-border bg-[var(--app-panel-2)] px-2 text-sm text-[var(--app-text)]" /></label>{availableRange && <button type="button" onClick={() => { setFrom(date(availableRange.startTime)); setThrough(date(availableRange.endTime)); }} className="h-10 rounded-md border app-border px-3 text-xs font-semibold">Use full history</button>}<span className="pb-2 text-xs app-muted">{rangeText}</span><button type="button" onClick={() => setSettings(null)} className="ml-auto h-10 rounded-md bg-[var(--app-panel-2)] px-3 text-xs font-semibold">Done</button></div>}
      </div>}
    </header>

    {sampleMode && <div className="shrink-0 border-b border-amber-400/35 bg-amber-400/10 px-4 py-2 text-xs"><strong>Sample data.</strong> Sign in to test real history. <a href="/sign-in?next=%2Fapp%2Fstrategies" className="font-semibold underline">Sign in</a></div>}

    <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <section aria-label="Test chart" className="relative min-h-[320px] flex-1 border-b app-border bg-[var(--app-panel-2)]/40">
          {pineReport?.candles ? <>
            <StrategyLabChart candles={pineReport.candles} plots={chartPlots} overlay={chartOverlay} trades={strategy?.trades ?? []} focusTrade={focusTrade} timeframe={ranTimeframe} theme={theme} precision={pricePrecision(pineReport.symbol)} />
            <div className="pointer-events-none absolute left-3 top-2 z-10 text-[11.5px] leading-5">
              <div><strong>{pineReport.symbol} · {ranTimeframe}</strong> <span className="app-muted">· {pineReport.dataSource}</span></div>
              <div className="flex flex-wrap gap-x-3">{chartPlots.map(plot => <span key={plot.title} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: plot.color || "#2962FF" }} />{plot.title}</span>)}<span className="app-muted">{title}</span></div>
            </div>
          </> : <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="max-w-sm">
              {busy ? <Loader2 size={22} className="mx-auto animate-spin text-[var(--app-accent-text)]" /> : <Play size={22} className="mx-auto text-[var(--app-accent-text)]" />}
              <p className="mt-3 text-sm font-semibold">{busy ? "Running your script…" : pineReport ? "Run the test again to draw it on the chart." : "Run a test to see it on the chart"}</p>
              <p className="mt-1 text-xs app-muted">{busy ? `${market?.symbol ?? ""} · ${pineTimeframe} · ${from} → ${through}` : "Every entry and exit is marked on the candles, with the script's plots on top."}</p>
            </div>
          </div>}
        </section>

        <section aria-label="Strategy tester" className={`flex shrink-0 flex-col bg-[var(--app-panel-solid)] ${testerOpen ? "h-[min(330px,45dvh)] min-h-[220px]" : ""}`}>
          <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b app-border px-2 sm:px-3">
            <div className="flex min-w-0 items-center overflow-x-auto">{tabs.map(([tab, label]) => <button key={tab} type="button" onClick={() => chooseTab(tab)} className={`h-10 shrink-0 border-b-2 px-3 text-xs font-semibold ${testerOpen && activeTab === tab ? "border-[var(--app-accent)] text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"} ${tab === "problems" && problemCount ? "text-loss" : ""}`}>{label}</button>)}</div>
            <div className="flex shrink-0 items-center gap-2"><span className="hidden text-[11px] app-muted sm:inline" role="status">{statusText}</span><button type="button" onClick={() => setTesterOpen(!testerOpen)} aria-label={testerOpen ? "Collapse strategy tester" : "Open strategy tester"} className="grid size-8 place-items-center rounded-md hover:bg-[var(--app-panel-2)]">{testerOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button></div>
          </div>
          {testerOpen && <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {activeTab === "overview" && (strategy ? <Overview report={strategy} timeframe={ranTimeframe} theme={theme} />
              : pineReport ? <div className="space-y-2 text-xs"><p><strong>Indicator</strong> <span className="app-muted">· {chartPlots.length} plots · {pineReport.bars.toLocaleString()} candles · {pineReport.overlay ? "drawn on price" : "drawn in its own pane"}</span></p><p className="app-muted">Indicators have no trades. Use a strategy() script to get performance results.</p></div>
              : <p className="py-8 text-center text-sm app-muted">{busy ? "Running…" : "Run a Pine v6 strategy to see its performance here."}</p>)}
            {activeTab === "performance" && strategy && <Performance report={strategy} timeframe={ranTimeframe} />}
            {activeTab === "trades" && strategy && <TradeList report={strategy} visibleTrades={visibleTrades} onMore={() => setVisibleTrades(count => count + 100)} focusTrade={focusTrade} onFocus={setFocusTrade} />}
            {activeTab === "problems" && <div className="space-y-2 text-sm">{error && <p role="alert" className="flex gap-2 text-loss"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</p>}{serverDiagnostics.map((issue, index) => <p key={`${issue.line}-${index}`} className="flex gap-2 text-loss"><AlertCircle size={15} className="mt-0.5 shrink-0" />Line {issue.line}: {issue.message}</p>)}{!problemCount && <p className="flex items-center gap-2 text-[var(--app-accent-text)]"><Check size={16} />No script errors.</p>}</div>}
            {activeTab === "properties" && <div className="grid max-w-3xl gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2">
              {([["Market", market ? `${market.symbol} · ${sourceName(market.source)}` : "—"], ["Candles", pineTimeframe], ["Period", `${from || "—"} → ${through || "—"}`], ["Starting balance", money(10_000)], ["Engine", pineReport?.engine ?? "Resin"], ["History", rangeText]] as [string, string][]).map(([label, value]) => <p key={label} className="flex justify-between gap-4 border-b app-border py-1.5"><span className="app-muted">{label}</span><span className="text-right">{value}</span></p>)}
              <p className="mt-3 leading-5 app-muted sm:col-span-2">Pine Script v6 strategy() and indicator() scripts run through Resin on ForexTestLab candles, so results can differ from TradingView&apos;s broker feeds. Imported libraries, request.* feeds, bar magnifier and realtime recalculation are not supported. Up to 30,000 candles per test; results are not saved to your account.</p>
            </div>}
          </div>}
        </section>
      </div>

      <aside aria-label="Pine editor" className="relative flex min-h-[420px] shrink-0 flex-col border-t app-border bg-[var(--code-bg)] lg:min-h-0 lg:w-[var(--lab-editor-width)] lg:border-l lg:border-t-0" style={{ "--lab-editor-width": `${editorWidth}px` } as React.CSSProperties}>
        <div onPointerDown={resizeEditor} role="separator" aria-orientation="vertical" aria-label="Resize editor" className="absolute inset-y-0 left-0 z-10 hidden w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-[var(--app-accent)]/40 lg:block" />
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--code-border)] bg-[var(--code-bar)] px-3 text-[11px] text-[var(--code-muted)]"><span className="truncate font-mono text-[var(--code-text)]">{title}.pine</span><span>{serverDiagnostics.length ? <span className="text-[var(--code-error)]">{serverDiagnostics.length} {serverDiagnostics.length === 1 ? "error" : "errors"}</span> : pineReport ? <span className="text-[var(--code-ok)]">✓ Compiled</span> : <span>Compiles on run</span>}</span></div>
        <div className="min-h-0 flex-1"><StrategyCodeEditor value={code} onChange={setCode} serverDiagnostics={serverDiagnostics} mode="pine" wrap minimap={false} /></div>
      </aside>
    </div>
  </div>;
}
