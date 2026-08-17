"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FlaskConical,
  Gauge,
  LineChart,
  NotebookPen,
  Play,
  ShieldCheck,
  Sigma,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { JournalReview, type ReviewRecord } from "@/components/app/journal/JournalReview";
import { ExitQualityCard } from "@/components/app/ExitQualityCard";
import { MetricInfo } from "@/components/app/MetricInfo";
import { TradeFocusProvider } from "@/components/app/TradeFocusContext";
import { TradesTable } from "@/components/app/TradesTable";
import { ExportTradesButton } from "@/components/app/ExportTradesButton";
import { DEMO_ANALYTICS_EQUITY_CURVE, DEMO_ANALYTICS_TRADES, DEMO_EXIT_QUALITY } from "@/lib/analytics/demo-data";
import type { PlanSummary } from "@/lib/backtest/exit-quality";
import { computeStatistics } from "@/lib/backtest/statistics";
import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import { createCalendar, type CalendarMonth } from "@/lib/analytics/trading-calendar";
import { formatNewYorkDate, formatNewYorkDateTime, getNewYorkDateParts, getTradingSession } from "@/lib/date-time";
import { formatSymbol } from "@/lib/market-data/symbols";

type PrototypeTab = "overview" | "trades" | "journal" | "reports" | "analyst";

const TABS = ["overview", "trades", "journal", "reports", "analyst"] as const;

const EQUITY = [
  100000, 100180, 100040, 100390, 100720, 100610, 100960, 101340,
  101120, 101680, 101940, 101760, 102150, 102720, 102490, 102960,
  103310, 103080, 103520, 103910, 103640, 104110, 103940, 104820,
];

const MONTHLY_RETURNS = [2.4, -0.8, 3.1, 1.7, -1.2, 4.3, 0.6, 2.8, -0.5, 3.6, 1.1, 2.2];
const DRAWDOWN = [0, -120, -80, -340, -260, -610, -430, -920, -710, -1492, -980, -620, -830, -410, -180, -390, -140, 0];
const WEEKDAY_RESULTS = [
  { label: "Mon", value: 980, trades: 4 },
  { label: "Tue", value: 1440, trades: 5 },
  { label: "Wed", value: 2010, trades: 4 },
  { label: "Thu", value: -360, trades: 3 },
  { label: "Fri", value: 750, trades: 3 },
];
const SESSION_RESULTS = [
  { label: "London open", value: 2940, rate: 74 },
  { label: "New York open", value: 1510, rate: 63 },
  { label: "London close", value: 620, rate: 60 },
  { label: "Asia", value: -250, rate: 40 },
];
const R_DISTRIBUTION = [
  { label: "<−1R", count: 1 },
  { label: "−1R", count: 3 },
  { label: "0R", count: 2 },
  { label: "+1R", count: 6 },
  { label: "+2R", count: 5 },
  { label: ">+2R", count: 2 },
];
const EXIT_RESULTS = [
  { label: "Take profit", value: 4080, trades: 6, winRate: 100 },
  { label: "Manual close", value: 1420, trades: 9, winRate: 67 },
  { label: "Stop loss", value: -680, trades: 3, winRate: 0 },
  { label: "Session end", value: 0, trades: 1, winRate: 0 },
];
const SIZE_RESULTS = [
  { label: "Under 0.50 lots", value: 780, trades: 5, share: 16 },
  { label: "0.50–0.99 lots", value: 1540, trades: 7, share: 32 },
  { label: "1.00 lots and above", value: 2500, trades: 7, share: 52 },
];
const HOLDING_RESULTS = [
  { label: "< 1 hour", value: -220, trades: 4 },
  { label: "1–4 hours", value: 3560, trades: 9 },
  { label: "4–8 hours", value: 1120, trades: 4 },
  { label: "> 8 hours", value: 360, trades: 2 },
];

type ResultRow = { label: string; value: number; trades: number; rate?: number; winRate?: number; share?: number };

interface AnalyticsModel {
  equity: number[];
  endingBalance: number;
  netProfit: number;
  returnPercent: number;
  winRate: string;
  profitFactor: string;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  closedTrades: number;
  averageR: string;
  payoffRatio: string;
  averageHold: string;
  bestTrade: number;
  worstTrade: number;
  streak: string;
  calendarMonths: CalendarMonth[];
  recentTrades: Array<{ pair: string; side: string; setup: string; result: string; r: string; time: string; positive: boolean }>;
  monthlyReturns: number[];
  drawdown: number[];
  weekdays: ResultRow[];
  sessions: ResultRow[];
  rDistribution: Array<{ label: string; count: number }>;
  exits: ResultRow[];
  sizes: ResultRow[];
  holding: ResultRow[];
  directions: { long: ResultRow; short: ResultRow };
  concentration: number;
  daysProcessed: number;
  monthsProcessed: number;
  tradingDays: number;
  winningTrades: number;
  losingTrades: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  tradesPerDay: number;
  tradesPerMonth: number;
  grossProfit: number;
  grossLoss: number;
  averageTrade: number;
  averageWin: number;
  averageLoss: number;
  profitPerMonth: number;
  maxLot: number;
  recoveryFactor: number;
}

export interface AnalyticsDesignPrototypeProps {
  mode?: "demo" | "live";
  initialDemo?: boolean;
  sessionId?: string;
  sessionName?: string;
  symbols?: string[];
  startTime?: number;
  endTime?: number;
  status?: string;
  trades?: ClosedTrade[];
  equityCurve?: EquityPoint[];
  startingBalance?: string;
  fullAccess?: boolean;
  onClose?: () => void;
  journalContent?: ReactNode;
  /**
   * The AI analyst. It used to sit at the bottom of the Reports tab, which put
   * the most differentiated part of the report behind the longest scroll on
   * the screen; it now has a tab of its own.
   */
  aiPanel?: ReactNode;
  /**
   * The counterfactual: what the hand-closed trades would have done if their
   * original stop and target had been left alone. Null while the session is
   * still being replayed, because working it out needs candles the trader has
   * not been shown.
   */
  exitQuality?: PlanSummary | null;
  reportFooter?: ReactNode;
  notice?: ReactNode;
}

const money = (value: number, signed = false) => `${signed && value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percentage = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;

function aggregateRows(trades: ClosedTrade[], label: (trade: ClosedTrade) => string): ResultRow[] {
  const groups = new Map<string, { value: number; trades: number; wins: number }>();
  for (const trade of trades) {
    const key = label(trade);
    const row = groups.get(key) ?? { value: 0, trades: 0, wins: 0 };
    row.value += Number(trade.pnl);
    row.trades += 1;
    if (Number(trade.pnl) > 0) row.wins += 1;
    groups.set(key, row);
  }
  return [...groups.entries()].map(([key, row]) => ({ label: key, value: row.value, trades: row.trades, rate: row.trades ? Math.round(row.wins / row.trades * 100) : 0, winRate: row.trades ? Math.round(row.wins / row.trades * 100) : 0 }));
}

function createLiveModel(trades: ClosedTrade[], equityCurve: EquityPoint[], startingBalanceValue: string, pair: string): AnalyticsModel {
  const startingBalance = Number(startingBalanceValue) || 0;
  const pnls = trades.map((trade) => Number(trade.pnl));
  const equity = equityCurve.length > 1 ? equityCurve.map((point) => Number(point.equity)) : [startingBalance, ...trades.reduce<number[]>((values, trade) => [...values, values[values.length - 1]! + Number(trade.pnl)], [startingBalance])];
  const endingBalance = startingBalance + pnls.reduce((sum, value) => sum + value, 0);
  const stats = computeStatistics({ startingBalance: startingBalanceValue, endingBalance: String(endingBalance), trades, equityCurve });
  const durations = trades.map((trade) => Math.max(0, trade.exitTime - trade.entryTime));
  const averageHoldMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const averageHold = averageHoldMs >= 3_600_000 ? `${(averageHoldMs / 3_600_000).toFixed(1)}h` : `${Math.round(averageHoldMs / 60_000)}m`;
  const riskMultiples = trades.map((trade) => {
    const risk = Number(trade.initialRiskAmount);
    return risk > 0 ? Number(trade.pnl) / risk : null;
  });
  const validR = riskMultiples.filter((value): value is number => value !== null && Number.isFinite(value));
  const averageR = validR.length ? `${validR.reduce((sum, value) => sum + value, 0) / validR.length >= 0 ? "+" : ""}${(validR.reduce((sum, value) => sum + value, 0) / validR.length).toFixed(2)}R` : "—";
  const wins = pnls.filter((value) => value > 0);
  const losses = pnls.filter((value) => value < 0);
  const firstTradeTime = trades.length ? Math.min(...trades.map((trade) => trade.entryTime)) : 0;
  const lastTradeTime = trades.length ? Math.max(...trades.map((trade) => trade.exitTime)) : 0;
  const daysProcessed = trades.length ? Math.max(1, (lastTradeTime - firstTradeTime) / 86_400_000) : 0;
  const monthsProcessed = daysProcessed / 30.4375;
  const tradingDays = new Set(trades.map((trade) => {
    const point = getNewYorkDateParts(trade.entryTime);
    return `${point.year}-${point.month}-${point.day}`;
  })).size;
  const averageWin = wins.length ? wins.reduce((sum, value) => sum + value, 0) / wins.length : 0;
  const averageLoss = losses.length ? Math.abs(losses.reduce((sum, value) => sum + value, 0) / losses.length) : 0;
  let peak = equity[0] ?? startingBalance;
  const drawdown = equity.map((value) => { peak = Math.max(peak, value); return value - peak; });
  const monthTotals = Array.from({ length: 12 }, () => 0);
  trades.forEach((trade) => {
    const monthIndex = getNewYorkDateParts(trade.exitTime).month - 1;
    monthTotals[monthIndex] = (monthTotals[monthIndex] ?? 0) + Number(trade.pnl);
  });
  const monthlyReturns = monthTotals.map((value) => startingBalance ? value / startingBalance * 100 : 0);
  const calendar = createCalendar(trades);
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdays = aggregateRows(trades, (trade) => weekdayNames[getNewYorkDateParts(trade.entryTime).weekday]!).sort((a, b) => weekdayNames.indexOf(a.label) - weekdayNames.indexOf(b.label));
  const sessions = aggregateRows(trades, (trade) => getTradingSession(trade.entryTime));
  const exits = aggregateRows(trades, (trade) => ({ "take-profit": "Take profit", "stop-loss": "Stop loss", manual: "Manual close", "session-end": "Session end" })[trade.exitReason]);
  const sizes = aggregateRows(trades, (trade) => Number(trade.lots) < 0.5 ? "Under 0.50 lots" : Number(trade.lots) < 1 ? "0.50–0.99 lots" : "1.00 lots and above");
  const totalPositive = sizes.filter((row) => row.value > 0).reduce((sum, row) => sum + row.value, 0);
  sizes.forEach((row) => { row.share = totalPositive > 0 && row.value > 0 ? Math.round(row.value / totalPositive * 100) : 0; });
  const holding = aggregateRows(trades, (trade) => { const hours = (trade.exitTime - trade.entryTime) / 3_600_000; return hours < 1 ? "< 1 hour" : hours < 4 ? "1–4 hours" : hours < 8 ? "4–8 hours" : "> 8 hours"; });
  const directionRows = aggregateRows(trades, (trade) => trade.direction === "long" ? "Long" : "Short");
  const long = directionRows.find((row) => row.label === "Long") ?? { label: "Long", value: 0, trades: 0, rate: 0 };
  const short = directionRows.find((row) => row.label === "Short") ?? { label: "Short", value: 0, trades: 0, rate: 0 };
  const topThree = [...wins].sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0);
  const netProfit = endingBalance - startingBalance;
  const rDistribution = [
    { label: "<−1R", count: validR.filter((value) => value < -1).length },
    { label: "−1R", count: validR.filter((value) => value >= -1 && value < -0.25).length },
    { label: "0R", count: validR.filter((value) => value >= -0.25 && value < 0.5).length },
    { label: "+1R", count: validR.filter((value) => value >= 0.5 && value < 1.5).length },
    { label: "+2R", count: validR.filter((value) => value >= 1.5 && value < 2.5).length },
    { label: ">+2R", count: validR.filter((value) => value >= 2.5).length },
  ];
  const streakTrade = trades[trades.length - 1];
  let streakCount = 0;
  if (streakTrade) { const positive = Number(streakTrade.pnl) > 0; for (let index = trades.length - 1; index >= 0 && (Number(trades[index]!.pnl) > 0) === positive; index -= 1) streakCount += 1; }
  return {
    equity, endingBalance, netProfit, returnPercent: startingBalance ? netProfit / startingBalance * 100 : 0,
    winRate: stats.winRate, profitFactor: stats.profitFactor, expectancy: Number(stats.expectancy) || 0,
    maxDrawdown: Number(stats.maxDrawdown) || 0, maxDrawdownPercent: Number(stats.maxDrawdownPercent) || 0,
    closedTrades: trades.length, averageR, payoffRatio: averageLoss ? (averageWin / averageLoss).toFixed(2) : "—", averageHold,
    bestTrade: wins.length ? Math.max(...wins) : 0, worstTrade: losses.length ? Math.min(...losses) : 0,
    streak: streakTrade ? `${streakCount} ${Number(streakTrade.pnl) > 0 ? "wins" : "losses"}` : "—",
    calendarMonths: calendar,
    recentTrades: [...trades].slice(-5).reverse().map((trade, index) => ({ pair, side: trade.direction === "long" ? "Buy" : "Sell", setup: exits.find((row) => row.label.toLowerCase().startsWith(trade.exitReason.split("-")[0]!))?.label ?? trade.exitReason.replaceAll("-", " "), result: money(Number(trade.pnl), true), r: riskMultiples[trades.length - 1 - index] == null ? "—" : `${riskMultiples[trades.length - 1 - index]! >= 0 ? "+" : ""}${riskMultiples[trades.length - 1 - index]!.toFixed(1)}R`, time: formatNewYorkDateTime(trade.exitTime, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), positive: Number(trade.pnl) >= 0 })),
    monthlyReturns, drawdown, weekdays, sessions, rDistribution, exits, sizes, holding,
    directions: { long, short }, concentration: wins.length ? Math.min(100, topThree / wins.reduce((sum, value) => sum + value, 0) * 100) : 0,
    daysProcessed,
    monthsProcessed,
    tradingDays,
    winningTrades: wins.length,
    losingTrades: losses.length,
    maxConsecutiveWins: stats.maxConsecutiveWins,
    maxConsecutiveLosses: stats.maxConsecutiveLosses,
    tradesPerDay: tradingDays ? trades.length / tradingDays : 0,
    tradesPerMonth: monthsProcessed ? trades.length / monthsProcessed : 0,
    grossProfit: wins.reduce((sum, value) => sum + value, 0),
    grossLoss: Math.abs(losses.reduce((sum, value) => sum + value, 0)),
    averageTrade: trades.length ? netProfit / trades.length : 0,
    averageWin,
    averageLoss,
    profitPerMonth: monthsProcessed ? netProfit / monthsProcessed : 0,
    maxLot: trades.length ? Math.max(...trades.map((trade) => Number(trade.lots) || 0)) : 0,
    recoveryFactor: modelSafeDivide(netProfit, Number(stats.maxDrawdown) || 0),
  };
}

function modelSafeDivide(value: number, divisor: number): number {
  return divisor ? value / divisor : 0;
}

function createDemoModel(): AnalyticsModel {
  // The calendar is left as calculated: the sample's own trades decide which
  // days are lit, so it agrees with the sample ledger one tab away.
  const calculated = createLiveModel(DEMO_ANALYTICS_TRADES, DEMO_ANALYTICS_EQUITY_CURVE, "100000", "EUR/USD");
  return {
    ...calculated,
    equity: EQUITY,
    monthlyReturns: MONTHLY_RETURNS, drawdown: DRAWDOWN,
    weekdays: WEEKDAY_RESULTS, sessions: SESSION_RESULTS.map((row) => ({ ...row, trades: 0 })), rDistribution: R_DISTRIBUTION,
    exits: EXIT_RESULTS.map((row) => ({ ...row, rate: row.winRate })), sizes: SIZE_RESULTS, holding: HOLDING_RESULTS,
    directions: { long: { label: "Long", value: 3420, trades: 11, rate: 73 }, short: { label: "Short", value: 1400, trades: 8, rate: 63 } }, concentration: 44,
  };
}

function linePath(values: number[]) {
  const width = 920;
  const height = 280;
  const pad = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const x = (index: number) => pad + index * ((width - pad * 2) / (values.length - 1));
  const y = (value: number) => pad + (1 - (value - min) / spread) * (height - pad * 2);
  return values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
}

function normalizedPath(values: number[], width = 920, height = 220) {
  const pad = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values.map((value, index) => {
    const x = pad + index * ((width - pad * 2) / (values.length - 1));
    const y = pad + (1 - (value - min) / spread) * (height - pad * 2);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function AnalyticsDesignPrototype({
  mode = "demo",
  initialDemo = false,
  sessionId,
  sessionName = "London-session breakout",
  symbols = ["EURUSD"],
  startTime,
  endTime,
  status = "finished",
  trades = [],
  equityCurve = [],
  startingBalance = "100000",
  fullAccess = true,
  onClose,
  journalContent,
  aiPanel,
  exitQuality = null,
  reportFooter,
  notice,
}: AnalyticsDesignPrototypeProps = {}) {
  const [tab, setTab] = useState<PrototypeTab>("overview");
  const [focusedTrade, setFocusedTrade] = useState<number | null>(null);
  const [range, setRange] = useState("All");
  const [showDemoData, setShowDemoData] = useState(initialDemo);
  const demo = mode === "demo" || showDemoData;
  const pairLabel = symbols.map(formatSymbol).join(" · ");
  const model = useMemo(() => demo ? createDemoModel() : createLiveModel(trades, equityCurve, startingBalance, pairLabel), [demo, trades, equityCurve, startingBalance, pairLabel]);
  const path = linePath(model.equity.length > 1 ? model.equity : [model.endingBalance, model.endingBalance]);
  const periodLabel = startTime && endTime ? `${formatNewYorkDate(startTime)} – ${formatNewYorkDate(endTime)}` : "Session period";
  const resumeHref = sessionId ? `/app/backtest?session=${encodeURIComponent(sessionId)}` : "/app/backtest";

  // A trade number cited in an AI answer opens the ledger on that trade.
  const focusTrade = useCallback((tradeNumber: number) => {
    setFocusedTrade(tradeNumber);
    setTab("trades");
  }, []);
  const tradeFocus = useMemo(
    () => (demo ? null : { tradeCount: trades.length, focusTrade }),
    [demo, focusTrade, trades.length],
  );

  return (
    <TradeFocusProvider value={tradeFocus}>
    <div className="analytics-workspace mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {onClose ? <button type="button" onClick={onClose} className="inline-flex items-center gap-2 text-xs font-semibold app-muted hover:text-[var(--app-text)]"><ArrowLeft size={14} aria-hidden /> Continue session</button> : <Link href="/app" className="inline-flex items-center gap-2 text-xs font-semibold app-muted hover:text-[var(--app-text)]"><ArrowLeft size={14} aria-hidden /> Dashboard</Link>}
        <div className="flex flex-wrap items-center gap-2">
          {mode === "live" && <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel)] p-1" role="group" aria-label="Analytics data source"><button type="button" onClick={() => setShowDemoData(false)} aria-pressed={!showDemoData} title="Show your own session data" className={`rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${!showDemoData ? "bg-brand-500 text-surface-950" : "app-muted hover:text-[var(--app-text)]"}`}>Your data</button><button type="button" onClick={() => setShowDemoData(true)} aria-pressed={showDemoData} title="Preview a completed report with sample trades" className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${showDemoData ? "bg-amber-300 text-surface-950" : "app-muted hover:text-[var(--app-text)]"}`}><FlaskConical size={11} aria-hidden /> Sample</button></div>}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-300"><LineChart size={11} aria-hidden /> Session analytics</span>
        </div>
      </div>

      {!demo && notice}

      <header className="mt-5 flex flex-col gap-5 border-b app-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs app-muted">
            <span className={`inline-flex items-center gap-1.5 font-semibold ${demo || status === "finished" ? "text-brand-300" : "text-amber-300"}`}><i className={`h-1.5 w-1.5 rounded-full ${demo || status === "finished" ? "bg-brand-400" : "bg-amber-400"}`} /> {demo || status === "finished" ? "Completed" : "Active"}</span>
            <span>{demo ? "EUR/USD" : pairLabel}</span><span>·</span><span>{demo ? "Jan 9, 2019 – Jan 19, 2024" : periodLabel}</span>{demo && <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-amber-200">SAMPLE</span>}
          </div>
          <h1 className="mt-2 truncate text-2xl font-bold tracking-[-0.025em] sm:text-3xl">{demo ? "London-session breakout — sample" : sessionName}</h1>
          <p className="mt-1 text-sm app-muted">Strategy performance report · New York time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demo ? <span className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted"><Download size={14} /> Sample preview</span> : fullAccess ? <ExportTradesButton trades={trades} symbol={symbols[0] ?? "EURUSD"} sessionId={sessionId ?? "session"} compact /> : <Link href="/account/billing" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted hover:bg-white/[0.05] hover:text-[var(--app-text)]"><Download size={14} /> Export with Pro</Link>}
          {onClose ? <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-xs font-bold text-surface-950 shadow-sm hover:bg-brand-400"><Play size={14} /> Continue replay</button> : <Link href={resumeHref} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-xs font-bold text-surface-950 shadow-sm hover:bg-brand-400"><Play size={14} /> {status === "finished" ? "Replay again" : "Continue replay"}</Link>}
        </div>
      </header>

      <nav className="flex overflow-x-auto border-b app-border" aria-label="Prototype report sections">
        {TABS.filter((item) => item !== "analyst" || Boolean(aiPanel)).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} disabled={item === "reports" && !fullAccess && !demo} title={item === "reports" && !fullAccess && !demo ? "Advanced reports are included with Pro" : undefined} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tab === item ? "border-brand-400 text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"}`}>{item}</button>
        ))}
      </nav>

      {tab === "overview" && (
        <main className="mt-5 space-y-4">
          <section className="overflow-hidden rounded-2xl bg-[var(--app-panel)] shadow-[0_18px_55px_-38px_rgba(0,0,0,0.9)]">
            <div className="grid xl:grid-cols-[minmax(0,1.8fr)_360px]">
              <div className="min-w-0 p-4 sm:p-5 lg:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Account equity</p>
                    <div className="mt-1.5 flex items-end gap-3">
                      <p className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">{money(model.endingBalance)}</p>
                      <span className={`mb-1 inline-flex items-center gap-1 text-xs font-semibold ${model.returnPercent >= 0 ? "text-brand-300" : "text-bear"}`}>{model.returnPercent >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {percentage(model.returnPercent)}</span>
                    </div>
                  </div>
                  <div className="inline-flex rounded-lg bg-[var(--app-panel-2)] p-1">
                    {["1M", "3M", "1Y", "All"].map((value) => <button key={value} type="button" onClick={() => setRange(value)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${range === value ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted"}`}>{value}</button>)}
                  </div>
                </div>
                <div className="relative mt-5 overflow-hidden rounded-xl bg-[var(--app-panel-2)]/55">
                  <svg viewBox="0 0 920 280" preserveAspectRatio="none" className="h-72 w-full" role="img" aria-label="Prototype account equity curve">
                    <defs><linearGradient id="prototype-equity" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22c3a0" stopOpacity=".22"/><stop offset="1" stopColor="#22c3a0" stopOpacity="0"/></linearGradient><pattern id="prototype-grid" width="115" height="56" patternUnits="userSpaceOnUse"><path d="M115 0H0V56" fill="none" stroke="currentColor" strokeOpacity=".07"/></pattern></defs>
                    <rect width="920" height="280" fill="url(#prototype-grid)" className="app-muted" />
                    <path d={`${path} L904,264 L16,264 Z`} fill="url(#prototype-equity)" />
                    <path d={path} fill="none" stroke={model.netProfit >= 0 ? "#22c3a0" : "#fb7185"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="absolute inset-x-4 bottom-3 flex justify-between text-[10px] app-muted"><span>{demo ? "Jan 2019" : startTime ? formatNewYorkDate(startTime, { month: "short", year: "numeric" }) : "Start"}</span><span>{demo ? "Jan 2020" : "Replay history"}</span><span>{demo ? "Jan 2022" : `${model.closedTrades} trades`}</span><span>{demo ? "Jan 2024" : endTime ? formatNewYorkDate(endTime, { month: "short", year: "numeric" }) : "Now"}</span></div>
                </div>
              </div>

              <aside className="border-t app-border bg-[var(--app-panel-2)]/38 p-5 xl:border-l xl:border-t-0 xl:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Performance summary</p><p className={`mt-2 font-mono text-3xl font-semibold ${model.netProfit >= 0 ? "text-brand-300" : "text-bear"}`}>{money(model.netProfit, true)}</p><p className="mt-1 text-xs app-muted">Net realised P/L</p></div>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-400/10 text-brand-300"><Sigma size={20} aria-hidden /></span>
                </div>
                <dl className="mt-6 divide-y app-border border-y app-border">
                  {[["Win rate", model.winRate === "Not available" ? "—" : `${model.winRate}%`], ["Profit factor", model.profitFactor === "Not available" ? "—" : model.profitFactor], ["Expectancy", model.closedTrades ? money(model.expectancy, true) : "—"], ["Max drawdown", money(-model.maxDrawdown)], ["Closed trades", String(model.closedTrades)]].map(([label,value]) => <div key={label} className="flex items-center justify-between py-3"><dt className="flex items-center gap-1.5 text-xs app-muted">{label}<MetricInfo term={label!} /></dt><dd className="font-mono text-sm font-semibold">{value}</dd></div>)}
                </dl>
                <div className="mt-5 rounded-xl bg-brand-400/[0.07] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-brand-300"><TrendingUp size={14} aria-hidden /> Edge forming</div>
                  <p className="mt-2 text-xs leading-5 app-muted">{model.closedTrades >= 30 ? "The sample is large enough to start judging consistency across market conditions." : `${model.netProfit >= 0 ? "Profitable" : "Developing"} sample with ${model.maxDrawdownPercent.toFixed(1)}% maximum drawdown. Add ${Math.max(0, 30 - model.closedTrades)} trades before treating the result as dependable.`}</p>
                </div>
              </aside>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border app-border bg-[var(--app-border)] sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Average R", model.averageR], ["Payoff ratio", model.payoffRatio], ["Avg hold", model.averageHold],
              ["Best trade", money(model.bestTrade, true)], ["Worst trade", money(model.worstTrade, true)], ["Current streak", model.streak],
            ].map(([label, value]) => <div key={label} className="bg-[var(--app-panel)] px-4 py-3.5"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] app-muted">{label}<MetricInfo term={label!} /></p><p className="mt-1.5 font-mono text-base font-semibold">{value}</p></div>)}
          </section>

          <ProjectAnalyticsOverview model={model} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
            <TradingActivityCalendar months={model.calendarMonths} />

            <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Execution</p><h2 className="mt-1 text-lg font-semibold">Recent trades</h2></div><button type="button" onClick={() => setTab("trades")} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300">View all <ArrowUpRight size={13}/></button></div>
              <div className="mt-4 divide-y app-border">
                {model.recentTrades.length ? model.recentTrades.map((trade)=><article key={`${trade.time}-${trade.pair}`} className="flex items-center gap-3 py-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${trade.positive ? "bg-brand-400/10 text-brand-300" : "bg-bear/10 text-bear"}`}>{trade.positive ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-xs font-semibold">{trade.pair} · {trade.side}</p><span className="text-[9px] app-muted">{trade.r}</span></div><p className="mt-1 truncate text-[10px] app-muted">{trade.setup} · {trade.time}</p></div><p className={`shrink-0 font-mono text-xs font-semibold ${trade.positive ? "text-brand-300" : "text-bear"}`}>{trade.result}</p></article>) : <p className="py-8 text-center text-xs app-muted">Close a trade to populate execution history.</p>}
              </div>
            </section>
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            {[
              { icon: Target, label: "Best exit profile", value: model.exits.slice().sort((a,b)=>b.value-a.value)[0]?.label ?? "No trade data", detail: model.exits.length ? `${money(model.exits.slice().sort((a,b)=>b.value-a.value)[0]!.value, true)} across ${model.exits.slice().sort((a,b)=>b.value-a.value)[0]!.trades} trades` : "Close trades to reveal the pattern" },
              { icon: LineChart, label: "Best market window", value: model.sessions.slice().sort((a,b)=>b.value-a.value)[0]?.label ?? "No trade data", detail: model.sessions.length ? `${model.sessions.slice().sort((a,b)=>b.value-a.value)[0]!.rate}% win rate · ${money(model.sessions.slice().sort((a,b)=>b.value-a.value)[0]!.value, true)}` : "Close trades to reveal the pattern" },
              { icon: CheckCircle2, label: "Sample quality", value: model.closedTrades >= 30 ? "Decision-ready" : "Still developing", detail: `${model.closedTrades} of 30 trades collected for a first reliable read` },
            ].map(({icon:Icon,label,value,detail})=><article key={label} className="rounded-xl bg-[var(--app-panel)] p-4"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] app-muted"><Icon size={15}/></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">{label}</p><h3 className="mt-1.5 text-sm font-semibold">{value}</h3><p className="mt-1 text-xs app-muted">{detail}</p></div></div></article>)}
          </section>
        </main>
      )}

      {tab === "trades" && <section className="mt-5 overflow-hidden rounded-2xl bg-[var(--app-panel)]"><div className="flex flex-wrap items-end justify-between gap-3 border-b app-border p-5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Execution ledger</p><h2 className="mt-1 text-xl font-semibold">Every closed trade</h2></div>{demo && <span className="rounded-full bg-amber-300/10 px-3 py-1 text-[10px] font-semibold text-amber-200">19 sample trades</span>}</div><TradesTable trades={demo ? DEMO_ANALYTICS_TRADES : trades} focusedTrade={demo ? null : focusedTrade} /></section>}
      {tab === "journal" && (demo ? <DemoJournalWorkspace /> : journalContent ?? <PrototypePlaceholder icon={NotebookPen} title="Trading journal" description="Journal entries for this session will appear here." />)}
      {tab === "reports" && <><ReportsWorkspace model={model} periodLabel={demo ? "Jan 2019 – Jan 2024" : periodLabel} /><ExitQualityCard trades={demo ? DEMO_ANALYTICS_TRADES : trades} plan={demo ? DEMO_EXIT_QUALITY : exitQuality} planUnavailable={status !== "finished" ? "Available once this session is complete. Working out what a trade would have done needs candles the replay has not shown you yet." : "No trade was closed by hand with a stop or target still to resolve, so there is nothing to test."} />{!demo && reportFooter}</>}
      {tab === "analyst" && aiPanel && <div className="mt-5">{aiPanel}</div>}
    </div>
    </TradeFocusProvider>
  );
}

/**
 * The month grid, with a step through every month that holds a trade.
 *
 * Months with no trades are not in the list at all, so the arrows never walk a
 * reader through an empty year to reach the next result.
 */
function TradingActivityCalendar({ months }: { months: CalendarMonth[] }) {
  const [index, setIndex] = useState(months.length - 1);
  // The list is rebuilt when the reader flips between their data and the
  // sample, and an index held over from the longer list would be out of range.
  const position = Math.min(index, months.length - 1);
  const month = months[position]!;
  const total = month.cells.reduce((sum, cell) => sum + (cell.value ?? 0), 0);

  return (
    <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Consistency</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">Trading activity<MetricInfo term="Trading activity" detail="Each cell is one day's realised profit or loss, placed on the day the trade closed, in New York time. Only months containing a trade are shown." /></h2>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setIndex(position - 1)} disabled={position === 0} aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-md app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft size={15} aria-hidden /></button>
          <span className="inline-flex min-w-[9.5rem] items-center justify-center gap-1.5 text-xs font-semibold app-muted"><CalendarDays size={14} aria-hidden /> {month.label}</span>
          <button type="button" onClick={() => setIndex(position + 1)} disabled={position === months.length - 1} aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-md app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight size={15} aria-hidden /></button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[9px] app-muted">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day)=><span key={day} className="py-1">{day}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {month.cells.map((cell,cellIndex)=><div key={cellIndex} className={`relative min-h-16 rounded-lg p-2 ${cell.day == null ? "bg-white/[0.015]" : cell.value! > 0 ? "bg-brand-400/[0.12]" : cell.value! < 0 ? "bg-bear/[0.12]" : "bg-white/[0.035]"}`}><span className="text-[9px] app-muted">{cell.day}</span>{cell.value != null && cell.value !== 0 && <p className={`mt-2 truncate font-mono text-[10px] font-semibold ${cell.value > 0 ? "text-brand-300" : "text-bear"}`}>{money(cell.value, true)}</p>}</div>)}
      </div>
      <p className="mt-3 text-[11px] app-muted">
        {months.length === 1 ? "One month of trading" : `Month ${position + 1} of ${months.length}`} ·{" "}
        <span className={total > 0 ? "font-semibold text-brand-300" : total < 0 ? "font-semibold text-bear" : "font-semibold"}>{money(total, true)}</span> this month
      </p>
    </section>
  );
}

function ProjectAnalyticsOverview({ model }: { model: AnalyticsModel }) {
  const groups = [
    {
      icon: Clock3,
      eyebrow: "Time",
      title: "Test coverage",
      tone: "text-accent-400",
      rows: [
        ["Days processed", model.daysProcessed.toFixed(1)],
        ["Months processed", model.monthsProcessed.toFixed(2)],
        ["Trading days", String(model.tradingDays)],
        ["Trades / active day", model.tradesPerDay.toFixed(2)],
      ],
    },
    {
      icon: Target,
      eyebrow: "Trades",
      title: "Outcome profile",
      tone: "text-amber-300",
      rows: [
        ["Winning / losing", `${model.winningTrades} / ${model.losingTrades}`],
        ["Trades / month", model.tradesPerMonth.toFixed(1)],
        ["Best win streak", String(model.maxConsecutiveWins)],
        ["Worst loss streak", String(model.maxConsecutiveLosses)],
      ],
    },
    {
      icon: TrendingUp,
      eyebrow: "Results",
      title: "Profit quality",
      tone: "text-brand-300",
      rows: [
        ["Gross profit", money(model.grossProfit, true)],
        ["Gross loss", money(-model.grossLoss)],
        ["Average win / loss", `${money(model.averageWin)} / ${money(-model.averageLoss)}`],
        ["Profit / month", money(model.profitPerMonth, true)],
      ],
    },
    {
      icon: ShieldCheck,
      eyebrow: "Risk",
      title: "Robustness",
      tone: "text-bear",
      rows: [
        ["Maximum drawdown", money(-model.maxDrawdown)],
        ["Recovery factor", model.recoveryFactor.toFixed(2)],
        ["Maximum lot used", model.maxLot.toFixed(2)],
        ["Average trade", money(model.averageTrade, true)],
      ],
    },
  ] as const;

  return (
    <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Project analytics</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">The test at a glance<MetricInfo term="The test at a glance" detail="Coverage, execution frequency, outcome quality, and risk in one compact read. Every figure below has its own (i) with the definition and how to read it." /></h2></div>
        <span className="rounded-full border app-border bg-[var(--app-panel-2)] px-3 py-1.5 font-mono text-[10px] app-muted">{model.closedTrades} closed trades</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map(({ icon: Icon, eyebrow, title, tone, rows }) => (
          <article key={title} className="relative overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]/38 p-4">
            <span aria-hidden className={`absolute inset-x-0 top-0 h-px bg-current opacity-40 ${tone}`} />
            <div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-lg bg-white/[0.04] ${tone}`}><Icon size={15} aria-hidden /></span><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] app-muted">{eyebrow}</p><h3 className="mt-0.5 text-sm font-semibold">{title}</h3></div></div>
            <dl className="mt-4 divide-y app-border">
              {rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-2.5"><dt className="flex items-center gap-1.5 text-[11px] app-muted">{label}<MetricInfo term={label!} /></dt><dd className="text-right font-mono text-xs font-semibold">{value}</dd></div>)}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * The sample journal now renders the very component the live journal uses in
 * Review mode. Previously this was a bespoke read-only design, so the sample
 * advertised a review experience the real product did not have.
 */
function DemoJournalWorkspace() {
  const records: ReviewRecord[] = DEMO_ANALYTICS_TRADES.map((trade, index) => ({
    journalId: trade.id,
    number: index + 1,
    direction: trade.direction,
    entryTime: trade.entryTime,
    pnl: trade.pnl,
    journal: trade.journal!,
  }));
  return (
    <main className="mt-5 overflow-hidden rounded-2xl bg-[var(--app-panel)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b app-border p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-300">Trading journal</p>
          <h2 className="mt-1 text-xl font-semibold">Decision review</h2>
          <p className="mt-1 text-xs app-muted">A realistic example of how plans, emotions, rules, and post-trade lessons appear.</p>
        </div>
        <span className="rounded-full bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold text-amber-200">Read-only sample</span>
      </div>
      <JournalReview records={records} onEdit={() => undefined} />
    </main>
  );
}


function ReportsWorkspace({ model, periodLabel }: { model: AnalyticsModel; periodLabel: string }) {
  const drawdownValues = model.drawdown.length > 1 ? model.drawdown : [0, 0];
  const drawdownPath = normalizedPath(drawdownValues);
  const bestMonth = Math.max(...model.monthlyReturns, 0);
  const worstMonth = Math.min(...model.monthlyReturns, 0);
  const averageMonth = model.monthlyReturns.reduce((sum, value) => sum + value, 0) / Math.max(1, model.monthlyReturns.length);
  const positiveMonths = model.monthlyReturns.filter((value) => value > 0).length;
  const bestSession = model.sessions.slice().sort((a, b) => b.value - a.value)[0];
  const rMax = Math.max(...model.rDistribution.map((bucket) => bucket.count), 1);
  const sessionMax = Math.max(...model.sessions.map((row) => Math.abs(row.value)), 1);
  const weekdayMax = Math.max(...model.weekdays.map((row) => Math.abs(row.value)), 1);
  const exitMax = Math.max(...model.exits.map((row) => Math.abs(row.value)), 1);
  const holdMax = Math.max(...model.holding.map((row) => Math.abs(row.value)), 1);

  return (
    <main className="mt-5 space-y-4">
      <section className="flex flex-col gap-4 rounded-2xl bg-[var(--app-panel)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Strategy reports</p>
          <h2 className="mt-1 text-xl font-semibold">Find where the edge comes from</h2>
          <p className="mt-1 text-xs app-muted">All {model.closedTrades} closed trades · {periodLabel} · New York time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold app-muted"><CalendarDays size={14} /> Entire test</button>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold app-muted"><BarChart3 size={14} /> Closed trades</button>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border app-border bg-[var(--app-border)] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Return / drawdown", model.maxDrawdown ? (Math.abs(model.netProfit) / model.maxDrawdown).toFixed(2) : "—", model.netProfit >= 0 ? "Positive" : "Needs attention"],
          ["Maximum drawdown", money(-model.maxDrawdown), `${model.maxDrawdownPercent.toFixed(1)}% from peak`],
          ["Positive months", `${positiveMonths} of 12`, `${Math.round(positiveMonths / 12 * 100)}% consistency`],
          ["Statistical confidence", model.closedTrades >= 30 ? "Established" : "Developing", model.closedTrades >= 30 ? "30+ trade sample" : `${30 - model.closedTrades} more trades needed`],
        ].map(([label, value, detail]) => (
          <div key={label} className="bg-[var(--app-panel)] px-4 py-4">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] app-muted">{label}<MetricInfo term={label!} /></p>
            <p className="mt-2 font-mono text-lg font-semibold">{value}</p>
            <p className="mt-1 text-[10px] app-muted">{detail}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.7fr)]">
        <ReportCard eyebrow="Risk profile" title="Drawdown and recovery" icon={TrendingDown} info="Every point below the line is money the account was down from its previous high. The depth is what you had to tolerate; the width — how long it stayed below the line — is how long you had to tolerate it.">
          <div className="mt-5 overflow-hidden rounded-xl bg-[var(--app-panel-2)]/55">
            <svg viewBox="0 0 920 220" preserveAspectRatio="none" className="h-60 w-full" role="img" aria-label="Drawdown curve">
              <defs>
                <linearGradient id="drawdown-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fb7185" stopOpacity=".04"/><stop offset="1" stopColor="#fb7185" stopOpacity=".25"/></linearGradient>
                <pattern id="report-grid" width="115" height="55" patternUnits="userSpaceOnUse"><path d="M115 0H0V55" fill="none" stroke="currentColor" strokeOpacity=".07"/></pattern>
              </defs>
              <rect width="920" height="220" fill="url(#report-grid)" className="app-muted" />
              <path d={`${drawdownPath} L904,16 L16,16 Z`} fill="url(#drawdown-fill)" />
              <path d={drawdownPath} fill="none" stroke="#fb7185" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <line x1="16" y1="16" x2="904" y2="16" stroke="currentColor" strokeOpacity=".13" />
            </svg>
          </div>
          <div className="mt-3 flex justify-between text-[10px] app-muted"><span>Start</span><span>Deepest: {money(-model.maxDrawdown)}</span><span>Equity path</span><span>Trade {model.closedTrades}</span></div>
        </ReportCard>

        <ReportCard eyebrow="Risk diagnosis" title="What the drawdown says" icon={Gauge} info="The worst decline set against what the strategy earned, so the reward can be judged against the risk it took rather than on its own.">
          <div className="mt-5 rounded-xl border app-border p-4">
            <div className="flex items-end justify-between"><div><p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] app-muted">Maximum depth<MetricInfo term="Maximum depth" /></p><p className="mt-1 font-mono text-2xl font-semibold text-bear">−{model.maxDrawdownPercent.toFixed(2)}%</p></div><p className="font-mono text-xs app-muted">{money(-model.maxDrawdown)}</p></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-bear" style={{ width: `${Math.min(100, model.maxDrawdownPercent / 4 * 100)}%` }} /></div>
            <p className="mt-2 text-[10px] app-muted">{model.maxDrawdownPercent.toFixed(1)}% maximum equity decline</p>
          </div>
          <dl className="mt-4 divide-y app-border">
            {[["Net realised P/L", money(model.netProfit, true)], ["Closed trades", String(model.closedTrades)], ["Return", percentage(model.returnPercent)], ["Ending equity", money(model.endingBalance)]].map(([label, value]) => <div key={label} className="flex justify-between py-3 text-xs"><dt className="flex items-center gap-1.5 app-muted">{label}<MetricInfo term={label!} /></dt><dd className="font-mono font-semibold">{value}</dd></div>)}
          </dl>
        </ReportCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
        <ReportCard eyebrow="Consistency" title="Monthly returns" icon={BarChart3} info="Each month's profit as a percentage of the starting balance. Look for how evenly the profit arrives — a year made in one month is far harder to trade live than the same year spread across twelve.">
          <div className="mt-6 grid h-56 grid-cols-12 items-center gap-2 border-b app-border px-1">
            {model.monthlyReturns.map((value, index) => {
              const height = Math.max(value === 0 ? 0 : 12, Math.abs(value) / Math.max(Math.abs(bestMonth), Math.abs(worstMonth), 0.01) * 86);
              return (
                <div key={index} className="flex h-full flex-col items-center justify-center">
                  <div className="flex h-[172px] w-full flex-col justify-center">
                    <div className="relative h-1/2 border-b border-white/10">
                      {value > 0 && <div className="absolute bottom-0 left-1/2 w-[72%] -translate-x-1/2 rounded-t bg-brand-400/80" style={{ height: `${height}%` }} />}
                    </div>
                    <div className="relative h-1/2">
                      {value < 0 && <div className="absolute left-1/2 top-0 w-[72%] -translate-x-1/2 rounded-b bg-bear/80" style={{ height: `${height}%` }} />}
                    </div>
                  </div>
                  <span className="mt-2 text-[9px] app-muted">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][index]}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs"><span className="app-muted">Best month <b className="ml-1 font-mono text-brand-300">{percentage(bestMonth)}</b></span><span className="app-muted">Worst month <b className="ml-1 font-mono text-bear">{percentage(worstMonth)}</b></span><span className="app-muted">Average <b className="ml-1 font-mono text-[var(--app-text)]">{percentage(averageMonth)}</b></span></div>
        </ReportCard>

        <ReportCard eyebrow="Market timing" title="Performance by session" icon={Clock3} info="Results grouped by the market window a trade was opened in, using New York time. Bar length is profit; the figure on the right is that window's win rate.">
          <div className="mt-5 space-y-5">
            {model.sessions.map((session) => (
              <div key={session.label}>
                <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{session.label}</span><span className={`font-mono font-semibold ${session.value >= 0 ? "text-brand-300" : "text-bear"}`}>{session.value >= 0 ? "+" : "−"}${Math.abs(session.value).toLocaleString()}</span></div>
                <div className="mt-2 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${session.value >= 0 ? "bg-brand-400" : "bg-bear"}`} style={{ width: `${Math.max(12, Math.abs(session.value) / sessionMax * 100)}%` }} /></div><span className="w-8 text-right font-mono text-[9px] app-muted">{session.rate}%</span></div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-brand-400/[0.07] p-3 text-xs leading-5 app-muted">{bestSession ? <><b className="text-brand-300">{bestSession.label}</b> currently leads with {money(bestSession.value, true)} and a {bestSession.rate}% win rate.</> : "Close trades in different market windows to compare session performance."}</div>
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard eyebrow="Timing" title="Performance by weekday" icon={CalendarDays} info="Results grouped by the day a trade was opened. With fewer than about a hundred trades there are only a handful in each day, so treat a standout day as a question rather than a finding.">
          <div className="mt-5 space-y-4">
            {model.weekdays.map((day) => (
              <div key={day.label} className="grid grid-cols-[34px_minmax(0,1fr)_72px] items-center gap-3 text-xs">
                <span className="font-semibold">{day.label}</span>
                <div className="h-7 overflow-hidden rounded-md bg-white/[0.035]"><div className={`flex h-full items-center rounded-md px-2 ${day.value >= 0 ? "bg-brand-400/15" : "bg-bear/15"}`} style={{ width: `${Math.max(18, Math.abs(day.value) / weekdayMax * 100)}%` }}><span className="text-[9px] app-muted">{day.trades} trades</span></div></div>
                <span className={`text-right font-mono font-semibold ${day.value >= 0 ? "text-brand-300" : "text-bear"}`}>{day.value >= 0 ? "+" : "−"}${Math.abs(day.value)}</span>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard eyebrow="Trade outcomes" title="R-multiple distribution" icon={Target} info="Each bar counts the trades that finished in that band. Trades with no recorded initial risk cannot be converted to R and are left out of this chart.">
          <div className="mt-6 grid h-44 grid-cols-6 items-end gap-3 border-b app-border px-2">
            {model.rDistribution.map((bucket) => <div key={bucket.label} className="flex h-full flex-col justify-end text-center"><span className="mb-2 font-mono text-[10px] app-muted">{bucket.count}</span><div className={`mx-auto w-[72%] rounded-t ${bucket.label.startsWith("+") || bucket.label.startsWith(">") ? "bg-brand-400/75" : bucket.label === "0R" ? "bg-white/20" : "bg-bear/75"}`} style={{ height: `${bucket.count / rMax * 80}%` }} /><span className="mt-2 pb-2 text-[9px] app-muted">{bucket.label}</span></div>)}
          </div>
        </ReportCard>
      </div>
      <section className="pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Edge breakdowns</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">Understand what is driving the result<MetricInfo term="Edge breakdowns" detail="The same profit, split every way that might explain it: exit reason, position size, direction, holding time. You are looking for a condition that is reliably weak and can be removed from the plan — not for the single best bucket, which on a small sample is usually chance." /></h2>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <ReportCard eyebrow="Trade exits" title="Performance by exit reason" icon={Target} info="How each trade ended: hit its target, hit its stop, closed by hand, or was still open when the session ended. A manual-close row that trails take-profit is the clearest sign that discretion is costing money.">
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[580px] divide-y app-border">
              <div className="grid grid-cols-[minmax(170px,1fr)_72px_90px_90px] gap-4 pb-2 text-[9px] font-semibold uppercase tracking-[0.1em] app-muted"><span>Exit reason</span><span>Trades</span><span>Win rate</span><span className="text-right">Net P/L</span></div>
              {model.exits.map((exit) => (
                <div key={exit.label} className="grid grid-cols-[minmax(170px,1fr)_72px_90px_90px] items-center gap-4 py-3 text-xs">
                  <div><p className="font-semibold">{exit.label}</p><div className="mt-2 h-1 w-full max-w-48 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${exit.value >= 0 ? "bg-brand-400" : "bg-bear"}`} style={{ width: `${Math.max(10, Math.abs(exit.value) / exitMax * 100)}%` }} /></div></div>
                  <span className="font-mono app-muted">{exit.trades}</span>
                  <span className="font-mono">{exit.winRate}%</span>
                  <span className={`text-right font-mono font-semibold ${exit.value > 0 ? "text-brand-300" : exit.value < 0 ? "text-bear" : "app-muted"}`}>{exit.value > 0 ? "+" : exit.value < 0 ? "−" : ""}${Math.abs(exit.value).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </ReportCard>

        <ReportCard eyebrow="Risk allocation" title="Performance by position size" icon={BarChart3} info="Which position sizes actually produced the profit. Compare a size bucket's contribution with the drawdown it caused before deciding to increase risk — a bucket can lead on profit and still be the one that hurt most.">
          <div className="mt-5 space-y-5">
            {model.sizes.map((bucket) => (
              <div key={bucket.label}>
                <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold">{bucket.label}</p><p className="mt-1 text-[9px] app-muted">{bucket.trades} trades · {bucket.share}% of positive P/L</p></div><p className={`font-mono text-xs font-semibold ${bucket.value >= 0 ? "text-brand-300" : "text-bear"}`}>{money(bucket.value, true)}</p></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-brand-400" style={{ width: `${bucket.share}%` }} /></div>
              </div>
            ))}
          </div>
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard eyebrow="Direction" title="Long versus short" icon={TrendingUp} info="Whether the edge works in both directions. Compare these before filtering the next test plan — but a lopsided result on a small sample is usually a few outlier trades rather than a real bias.">
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-400/[0.07] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">Long</p><p className={`mt-2 font-mono text-xl font-semibold ${model.directions.long.value >= 0 ? "text-brand-300" : "text-bear"}`}>{money(model.directions.long.value, true)}</p><p className="mt-1 text-[10px] app-muted">{model.directions.long.trades} trades · {model.directions.long.rate}% won</p></div>
            <div className="rounded-xl bg-white/[0.025] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">Short</p><p className={`mt-2 font-mono text-xl font-semibold ${model.directions.short.value >= 0 ? "text-brand-300" : "text-bear"}`}>{money(model.directions.short.value, true)}</p><p className="mt-1 text-[10px] app-muted">{model.directions.short.trades} trades · {model.directions.short.rate}% won</p></div>
          </div>
        </ReportCard>

        <ReportCard eyebrow="Trade management" title="Performance by holding time" icon={Clock3} info="How long a trade was open, against what it made. Use it to tell whether you are exiting too early or overstaying — a negative short-hold bucket usually means trades are being cut before the setup has had time to work.">
          <div className="mt-5 space-y-3">
            {model.holding.map((bucket) => (
              <div key={bucket.label} className="grid grid-cols-[76px_minmax(0,1fr)_72px] items-center gap-2 text-[10px]">
                <span className="app-muted">{bucket.label}</span>
                <div className="h-5 overflow-hidden rounded bg-white/[0.035]"><div className={`h-full rounded ${bucket.value >= 0 ? "bg-brand-400/20" : "bg-bear/20"}`} style={{ width: `${Math.max(12, Math.abs(bucket.value) / holdMax * 100)}%` }} /></div>
                <span className={`text-right font-mono font-semibold ${bucket.value >= 0 ? "text-brand-300" : "text-bear"}`}>{bucket.value >= 0 ? "+" : "−"}${Math.abs(bucket.value)}</span>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard eyebrow="Robustness" title="Profit concentration" icon={ShieldCheck}>
          <div className="mt-5 flex items-center gap-5">
            <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#22c3a0 0 ${model.concentration}%, rgba(255,255,255,.08) ${model.concentration}% 100%)` }}><div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[var(--app-panel)]"><div className="text-center"><p className="font-mono text-lg font-semibold">{model.concentration.toFixed(0)}%</p><p className="text-[8px] app-muted">top 3</p></div></div></div>
            <div><p className="text-xs font-semibold">{model.concentration <= 50 ? "Profit is reasonably distributed" : "Profit is concentrated"}</p><p className="mt-2 text-xs leading-5 app-muted">The three largest winners produce {model.concentration.toFixed(0)}% of net profit.</p></div>
          </div>
          <dl className="mt-4 divide-y app-border"><div className="flex justify-between py-2.5 text-xs"><dt className="flex items-center gap-1.5 app-muted">Best trade<MetricInfo term="Best trade" /></dt><dd className="font-mono font-semibold text-brand-300">{money(model.bestTrade, true)}</dd></div><div className="flex justify-between py-2.5 text-xs"><dt className="flex items-center gap-1.5 app-muted">Top-three contribution<MetricInfo term="Top-three contribution" /></dt><dd className="font-mono font-semibold">{model.concentration.toFixed(1)}%</dd></div></dl>
        </ReportCard>
      </div>
    </main>
  );
}

/**
 * `info` is where a card's explanatory paragraph goes. These used to sit under
 * the chart as body copy, which meant a reader who already knew what a
 * drawdown was still had to scroll past the explanation on every visit.
 */
function ReportCard({ eyebrow, title, icon: Icon, info, children }: { eyebrow: string; title: string; icon: typeof LineChart; info?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">{eyebrow}</p><h3 className="mt-1 flex items-center gap-2 text-lg font-semibold">{title}<MetricInfo term={title} detail={info} /></h3></div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] app-muted"><Icon size={16} /></span>
      </div>
      {children}
    </section>
  );
}

function PrototypePlaceholder({ icon: Icon, title, description }: { icon: typeof LineChart; title: string; description: string }) {
  return <section className="mt-5 grid min-h-[420px] place-items-center rounded-2xl bg-[var(--app-panel)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><Icon size={22}/></span><h2 className="mt-4 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 app-muted">{description}</p><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">Prototype view</p></div></section>;
}
