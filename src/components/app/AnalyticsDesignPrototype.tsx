"use client";

import Link from "next/link";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
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
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { JournalReview, type ReviewRecord } from "@/components/app/journal/JournalReview";
import { ExitQualityCard } from "@/components/app/ExitQualityCard";
import { MetricInfo } from "@/components/app/MetricInfo";
import { ReportTimeZone } from "@/components/app/ReportTimeZone";
import { TradeFocusProvider } from "@/components/app/TradeFocusContext";
import { TradesTable } from "@/components/app/TradesTable";
import { ExportTradesButton } from "@/components/app/ExportTradesButton";
import { DEMO_ANALYTICS_EQUITY_CURVE, DEMO_ANALYTICS_PERIOD, DEMO_ANALYTICS_TRADES, DEMO_EXIT_QUALITY } from "@/lib/analytics/demo-data";
import type { PlanSummary } from "@/lib/backtest/exit-quality";
import { computeStatistics } from "@/lib/backtest/statistics";
import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import { Decimal } from "@/lib/decimal";
import { recordedChartPeriod, returnPercent } from "@/lib/analytics/performance-display";
import { monthlyReturnSeries, type MonthlyReturn } from "@/lib/analytics/monthly-returns";
import { RELIABLE_SAMPLE_TRADES, sampleIsReliable, tradesUntilReliable } from "@/lib/analytics/sample-size";
import { WEEKDAY_LABELS, createCalendar, type CalendarMonth } from "@/lib/analytics/trading-calendar";
import { analyticsTrades } from "@/lib/analytics/trade-scope";
import { replayDayLabel, replayDayPercent } from "@/lib/backtest/replay-progress";
import { formatNewYorkDate, formatNewYorkDateTime, getNewYorkDateParts, getTradingSession } from "@/lib/date-time";
import { formatSymbol } from "@/lib/market-data/symbols";

type PrototypeTab = "overview" | "trades" | "journal" | "reports" | "analyst";

const TABS = ["overview", "trades", "journal", "reports", "analyst"] as const;
const DEMO_ANALYTICS_SCOPED_TRADES = analyticsTrades(DEMO_ANALYTICS_TRADES);

type ResultRow = { label: string; value: number; trades: number; rate?: number; winRate?: number; share?: number };

interface AnalyticsModel {
  equity: number[];
  balance: number[];
  endingBalance: number;
  netProfit: number;
  returnPercent: number;
  winRate: string;
  profitFactor: string;
  expectancy: number;
  /** Null when there is no equity history to measure it against. */
  maxDrawdown: number | null;
  maxDrawdownPercent: number | null;
  closedTrades: number;
  averageR: string;
  payoffRatio: string;
  averageHold: string;
  bestTrade: number;
  worstTrade: number;
  streak: string;
  calendarMonths: CalendarMonth[];
  recentTrades: Array<{ pair: string; side: string; setup: string; result: string; r: string; time: string; positive: boolean }>;
  monthlyReturns: MonthlyReturn[];
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
  currentTime?: number | null;
  lastSavedLabel?: string;
  status?: string;
  trades?: ClosedTrade[];
  equityCurve?: EquityPoint[];
  startingBalance?: string;
  endingBalance?: string;
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
  showReturn?: boolean;
  sessionSelector?: ReactNode;
}

const money = (value: number, signed = false) => `${signed && value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percentage = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
/** A drawdown that was never recorded reads as absent, not as zero. */
const drawdownMoney = (value: number | null) => (value === null ? "—" : money(-value));
const drawdownPercent = (value: number | null, digits = 1) =>
  value === null ? "—" : `${value.toFixed(digits)}%`;

/** toFixed emits an ASCII hyphen; every other figure on these screens uses −. */
const ratio = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;

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

/**
 * @param fallbackPair Label for trades saved before multi-pair execution, which
 * carry no symbol of their own. Those all belong to the session's traded pair.
 */
function createLiveModel(trades: ClosedTrade[], equityCurve: EquityPoint[], startingBalanceValue: string, fallbackPair: string, endingBalanceValue?: string): AnalyticsModel {
  const startingBalance = Number(startingBalanceValue) || 0;
  const pnls = trades.map((trade) => Number(trade.pnl));
  const realisedPath = [startingBalance, ...trades.reduce<number[]>((values, trade) => [...values, values[values.length - 1]! + Number(trade.pnl)], [startingBalance])];
  const equity = equityCurve.length > 1 ? equityCurve.map((point) => Number(point.equity)) : realisedPath;
  const balance = equityCurve.length > 1 ? equityCurve.map((point) => Number(point.balance)) : realisedPath;
  const endingBalance = Number(endingBalanceValue ?? trades.reduce((sum, trade) => sum.plus(trade.pnl), new Decimal(startingBalanceValue)).toFixed(2));
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
  const monthlyReturns = monthlyReturnSeries(trades, startingBalance);
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
  const netProfit = new Decimal(endingBalance).minus(startingBalanceValue).toNumber();
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
    equity, endingBalance, netProfit, returnPercent: returnPercent(startingBalanceValue, String(endingBalance)),
    winRate: stats.winRate, profitFactor: stats.profitFactor, expectancy: Number(stats.expectancy) || 0,
    maxDrawdown: numberOrNull(stats.maxDrawdown), maxDrawdownPercent: numberOrNull(stats.maxDrawdownPercent),
    closedTrades: trades.length, averageR, payoffRatio: averageLoss ? (averageWin / averageLoss).toFixed(2) : "—", averageHold,
    bestTrade: wins.length ? Math.max(...wins) : 0, worstTrade: losses.length ? Math.min(...losses) : 0,
    streak: streakTrade ? `${streakCount} ${Number(streakTrade.pnl) > 0 ? "wins" : "losses"}` : "—",
    calendarMonths: calendar,
    recentTrades: [...trades].slice(-5).reverse().map((trade, index) => ({ pair: trade.symbol ? formatSymbol(trade.symbol) : fallbackPair, side: trade.direction === "long" ? "Buy" : "Sell", setup: exits.find((row) => row.label.toLowerCase().startsWith(trade.exitReason.split("-")[0]!))?.label ?? trade.exitReason.replaceAll("-", " "), result: money(Number(trade.pnl), true), r: riskMultiples[trades.length - 1 - index] == null ? "—" : `${riskMultiples[trades.length - 1 - index]! >= 0 ? "+" : ""}${riskMultiples[trades.length - 1 - index]!.toFixed(1)}R`, time: formatNewYorkDateTime(trade.exitTime, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), positive: Number(trade.pnl) >= 0 })),
    balance, monthlyReturns, drawdown, weekdays, sessions, rDistribution, exits, sizes, holding,
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
    recoveryFactor: modelSafeDivide(netProfit, numberOrNull(stats.maxDrawdown) ?? 0),
  };
}

/**
 * "Not available" has to survive as absence. Coercing it to zero is how the
 * screens came to print "$0.00 maximum drawdown" for sessions whose drawdown
 * was simply never recorded.
 */
function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function modelSafeDivide(value: number, divisor: number): number {
  return divisor ? value / divisor : 0;
}

/**
 * The sample, computed from the sample's own trades.
 *
 * This used to calculate a model and then overwrite nine of its fields with
 * hand-written tables. They tied to the headline — each summed to $4,820 — but
 * not to the nineteen trades sitting one tab away: the exit table claimed nine
 * manual closes at a 67% win rate where the ledger holds four, all winners,
 * and the exit-quality card immediately beneath it said "the 4 trades you
 * closed by hand". A sample that contradicts itself teaches a reader to
 * distrust the real report too.
 */
function createDemoModel(): AnalyticsModel {
  return createLiveModel(
    DEMO_ANALYTICS_SCOPED_TRADES,
    DEMO_ANALYTICS_EQUITY_CURVE,
    "100000",
    "EUR/USD",
  );
}

function linePath(values: number[], domain = values) {
  const width = 920;
  const pad = 16;
  const top = 16;
  const bottom = 190;
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  const spread = max - min || 1;
  const x = (index: number) => pad + index * ((width - pad * 2) / (values.length - 1));
  const y = (value: number) => top + (1 - (value - min) / spread) * (bottom - top);
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

function InteractiveDrawdownChart({ values, maxDrawdown, closedTrades }: { values: number[]; maxDrawdown: number | null; closedTrades: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const drawdownValues = values.length > 1 ? values : [0, 0];
  const width = 920;
  const height = 220;
  const pad = 16;
  const min = Math.min(...drawdownValues);
  const max = Math.max(...drawdownValues);
  const spread = max - min || 1;
  const point = (index: number) => ({
    x: pad + index * ((width - pad * 2) / (drawdownValues.length - 1)),
    y: pad + (1 - (drawdownValues[index]! - min) / spread) * (height - pad * 2),
  });
  const active = hoverIndex === null ? null : point(hoverIndex);
  const updateHover = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setHoverIndex(Math.round(ratio * (drawdownValues.length - 1)));
  };

  return (
    <div className="relative mt-5 overflow-hidden rounded-xl bg-[var(--app-panel-2)]/55">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-60 w-full touch-none" role="img" aria-label="Interactive drawdown curve" onPointerMove={updateHover} onPointerLeave={() => setHoverIndex(null)}>
        <defs>
          <linearGradient id="drawdown-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fb7185" stopOpacity=".04"/><stop offset="1" stopColor="#fb7185" stopOpacity=".25"/></linearGradient>
          <pattern id="report-grid" width="115" height="55" patternUnits="userSpaceOnUse"><path d="M115 0H0V55" fill="none" stroke="currentColor" strokeOpacity=".07"/></pattern>
        </defs>
        <rect width={width} height={height} fill="url(#report-grid)" className="app-muted" />
        <path d={`${normalizedPath(drawdownValues)} L904,16 L16,16 Z`} fill="url(#drawdown-fill)" />
        <path d={normalizedPath(drawdownValues)} fill="none" stroke="#fb7185" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <line x1="16" y1="16" x2="904" y2="16" stroke="currentColor" strokeOpacity=".13" />
        {active && <><line x1={active.x} y1={pad} x2={active.x} y2={height - pad} stroke="#fb7185" strokeOpacity=".4" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /><circle cx={active.x} cy={active.y} r="4.5" fill="#fb7185" stroke="var(--app-panel)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
      </svg>
      {active && hoverIndex !== null && <div className="pointer-events-none absolute top-3 z-10 min-w-[130px] -translate-x-1/2 rounded-lg border border-rose-300/30 bg-[var(--app-panel)]/95 px-3 py-2 shadow-xl" style={{ left: `${(active.x / width) * 100}%` }}><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-300">Drawdown</p><p className="mt-1 font-mono text-sm font-semibold text-[var(--app-text)]">{drawdownMoney(drawdownValues[hoverIndex] ?? 0)}</p><p className="mt-0.5 text-[10px] app-muted">Point {hoverIndex + 1} of {drawdownValues.length}</p></div>}
      <div className="mt-3 flex justify-between px-1 text-[10px] app-muted"><span>Start</span><span>Deepest: {drawdownMoney(maxDrawdown)}</span><span>Equity path</span><span>Trade {closedTrades}</span></div>
    </div>
  );
}

export function AnalyticsDesignPrototype({
  mode = "demo",
  initialDemo = false,
  sessionId,
  sessionName = "London-session breakout",
  symbols = ["EURUSD"],
  startTime,
  endTime,
  currentTime = null,
  lastSavedLabel,
  status = "finished",
  trades = [],
  equityCurve = [],
  startingBalance = "100000",
  endingBalance,
  fullAccess = true,
  onClose,
  journalContent,
  aiPanel,
  exitQuality = null,
  reportFooter,
  notice,
  showReturn = true,
  sessionSelector,
}: AnalyticsDesignPrototypeProps = {}) {
  const [tab, setTab] = useState<PrototypeTab>("overview");
  const [focusedTrade, setFocusedTrade] = useState<number | null>(null);
  const [range, setRange] = useState("All");
  const [showDemoData, setShowDemoData] = useState(initialDemo);
  const demo = mode === "demo" || showDemoData;
  const pairLabel = symbols.map(formatSymbol).join(" · ");
  // Legacy trades carry no symbol; they were all executed on the session's
  // traded pair, so that is the fallback — never the joined list of every pair
  // in the session, which claimed each trade had been taken on all of them.
  const tradedPairLabel = formatSymbol(symbols[0] ?? "EURUSD");
  const scopedTrades = useMemo(() => analyticsTrades(trades), [trades]);
  const hasExcludedTrades = scopedTrades.length !== trades.length;
  // Persisted balances and equity still contain an experimental trade's P/L.
  // Rebuild the path from included realised trades whenever one is excluded.
  const scopedEquityCurve = useMemo(
    () => hasExcludedTrades ? [] : equityCurve,
    [equityCurve, hasExcludedTrades],
  );
  const scopedEndingBalance = hasExcludedTrades ? undefined : endingBalance;
  const model = useMemo(
    () => demo
      ? createDemoModel()
      : createLiveModel(scopedTrades, scopedEquityCurve, startingBalance, tradedPairLabel, scopedEndingBalance),
    [demo, scopedTrades, scopedEquityCurve, startingBalance, tradedPairLabel, scopedEndingBalance],
  );
  const chartPeriod = demo ? DEMO_ANALYTICS_PERIOD : recordedChartPeriod(scopedEquityCurve, scopedTrades, startTime);
  const equityValues = model.equity.length > 1 ? model.equity : [model.endingBalance, model.endingBalance];
  const equityPath = linePath(equityValues);
  const overviewMonthMax = Math.max(...model.monthlyReturns.map((month) => Math.abs(month.percent)), 1);
  const overviewRMax = Math.max(...model.rDistribution.map((bucket) => bucket.count), 1);
  const overviewSessionMax = Math.max(...model.sessions.map((row) => Math.abs(row.value)), 1);
  const overviewTradePnls = (demo ? DEMO_ANALYTICS_SCOPED_TRADES : scopedTrades).slice(-20).map((trade) => Number(trade.pnl));
  const overviewTradePnlMax = Math.max(...overviewTradePnls.map((value) => Math.abs(value)), 1);
  // The sample used to carry a hand-written period that its own trades,
  // calendar and equity axis all contradicted. Both modes now derive it.
  const periodStart = demo ? DEMO_ANALYTICS_PERIOD.startTime : startTime;
  const periodEnd = demo ? DEMO_ANALYTICS_PERIOD.endTime : endTime;
  const periodLabel = periodStart && periodEnd ? `${formatNewYorkDate(periodStart)} – ${formatNewYorkDate(periodEnd)}` : "Session period";
  const compactMarketLabel = symbols.length > 1 ? `${formatSymbol(symbols[0] ?? "EURUSD")} +${symbols.length - 1} markets` : formatSymbol(symbols[0] ?? "EURUSD");
  const replayInput = { startTime: startTime ?? 0, endTime: endTime ?? startTime ?? 0, currentTime };
  const replayPercent = status === "finished" ? 100 : replayDayPercent(replayInput);
  const replayPositionLabel = replayDayLabel(replayInput);
  const displayedSessionName = demo ? "London-session breakout — sample" : sessionName;
  const normalizedSessionName = displayedSessionName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedPair = (demo ? "EUR/USD" : pairLabel).toLowerCase().replace(/[^a-z0-9]/g, "");
  const showPairInMetadata = !normalizedPair || !normalizedSessionName.includes(normalizedPair);
  const resumeHref = sessionId ? `/app/backtest?session=${encodeURIComponent(sessionId)}` : "/app/backtest";

  // A trade number cited in an AI answer opens the ledger on that trade.
  const focusTrade = useCallback((tradeNumber: number) => {
    setFocusedTrade(tradeNumber);
    setTab("trades");
  }, []);
  const tradeFocus = useMemo(
    () => (demo ? null : { tradeCount: scopedTrades.length, focusTrade }),
    [demo, focusTrade, scopedTrades.length],
  );
  const showingLiveSample = mode === "live" && showDemoData;
  const samplePreviewButton = mode === "live" && !showDemoData ? <button type="button" onClick={() => setShowDemoData(true)} className="inline-flex items-center gap-2 text-[11px] font-semibold text-brand-300 transition-colors hover:text-brand-200"><FlaskConical size={13} aria-hidden /> View sample report</button> : null;
  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {demo ? <span className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted"><FlaskConical size={14} /> Sample report</span> : fullAccess ? <ExportTradesButton trades={scopedTrades} symbol={symbols[0] ?? "EURUSD"} sessionId={sessionId ?? "session"} compact /> : <Link href="/account/billing" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted hover:bg-white/[0.05] hover:text-[var(--app-text)]"><Download size={14} /> Export with Pro</Link>}
      {!demo && (onClose ? <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-xs font-bold text-surface-950 shadow-sm hover:bg-brand-400"><Play size={14} /> Continue replay</button> : <Link href={resumeHref} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-xs font-bold text-surface-950 shadow-sm hover:bg-brand-400"><Play size={14} /> {status === "finished" ? "Replay again" : "Continue replay"}</Link>)}
    </div>
  );
  const sessionMetadata = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] app-muted">
      {showPairInMetadata && <><span>{demo ? "EUR/USD" : sessionSelector ? compactMarketLabel : pairLabel}</span><span aria-hidden>·</span></>}
      <span>{periodLabel}</span>
      {!sessionSelector && <><span aria-hidden>·</span><ReportTimeZone compact sessionId={demo ? undefined : sessionId} startTime={periodStart} endTime={periodEnd} /></>}
      {demo && <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-amber-200">SAMPLE</span>}
    </div>
  );
  const sessionContinuation = (
    <div className="grid gap-3 sm:grid-cols-[minmax(9rem,1.2fr)_minmax(10rem,1fr)_minmax(7rem,0.7fr)] sm:divide-x sm:divide-[var(--app-border)]">
      <div className="sm:pr-5"><div className="flex items-center justify-between gap-3 text-[9px] font-semibold uppercase tracking-[0.12em] app-muted"><span>Replay progress</span><span className="font-mono text-brand-300">{replayPercent.toFixed(0)}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-brand-400" style={{ width: `${replayPercent}%` }} /></div></div>
      <div className="sm:px-5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] app-muted">Position</p><p className="mt-1 text-xs font-semibold">{status === "finished" ? "Replay complete" : replayPositionLabel}</p></div>
      <div className="sm:pl-5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] app-muted">Last saved</p><p className="mt-1 text-xs font-semibold">{lastSavedLabel ?? "Recently"}</p></div>
    </div>
  );

  return (
    <TradeFocusProvider value={tradeFocus}>
    <div className="analytics-workspace mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      {showReturn && onClose && <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-2 text-xs font-semibold app-muted hover:text-[var(--app-text)]"><ArrowLeft size={14} aria-hidden /> Continue session</button>
      </div>}

      {!demo && notice}

      {sessionSelector ? <header className="mt-4 border-b app-border pb-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><h1 className="text-2xl font-bold tracking-[-0.025em] sm:text-3xl">Analytics</h1>{!showingLiveSample && headerActions}</div>{showingLiveSample ? <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-[linear-gradient(110deg,rgba(245,158,11,0.10),var(--app-panel))] px-4 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><FlaskConical size={16} aria-hidden /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200">Sample analytics</p><p className="mt-0.5 truncate text-sm font-semibold">Completed strategy report</p></div><div className="hidden sm:block">{sessionMetadata}</div><button type="button" onClick={() => setShowDemoData(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-200/20 text-amber-100 transition-colors hover:bg-amber-200/10" aria-label="Close sample report" title="Close sample report"><X size={16} aria-hidden /></button></div> : <div className="mt-4 grid gap-5 rounded-2xl border app-border bg-[var(--app-panel)] px-4 py-3.5 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(32rem,1.35fr)] lg:items-center"><div className="min-w-0">{sessionSelector}<div className="mt-2 pl-12">{sessionMetadata}</div></div>{sessionContinuation}</div>}</header> : <header className="mt-4 flex flex-col gap-4 border-b app-border pb-4 lg:flex-row lg:items-end lg:justify-between"><div className="min-w-0"><h1 className="truncate text-2xl font-bold tracking-[-0.025em] sm:text-3xl">{displayedSessionName}</h1><div className="mt-2">{sessionMetadata}</div></div>{headerActions}</header>}

      <nav className="flex overflow-x-auto border-b app-border" aria-label="Prototype report sections">
        {TABS.filter((item) => item !== "analyst" || Boolean(aiPanel)).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} disabled={item === "reports" && !fullAccess && !demo} title={item === "reports" && !fullAccess && !demo ? "Advanced reports are included with Pro" : undefined} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tab === item ? "border-brand-400 text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"}`}>{item}</button>
        ))}
      </nav>

      {tab === "overview" && (
        <main className="mt-5 space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "Account equity", value: money(model.endingBalance), tone: "text-[var(--app-text)]" },
              { label: "Net realised P/L", value: model.closedTrades ? money(model.netProfit, true) : "—", tone: model.netProfit >= 0 ? "text-profit" : "text-loss" },
              { label: "Win rate", value: model.winRate === "Not available" ? "—" : `${model.winRate}%`, tone: "text-[var(--app-text)]" },
              { label: "Closed trades", value: String(model.closedTrades), tone: "text-[var(--app-text)]" },
              { label: "Maximum drawdown", value: model.closedTrades ? drawdownMoney(model.maxDrawdown) : "—", tone: "text-[var(--app-text)]" },
            ].map(({ label, value, tone }, index) => (
              <article key={label} className={`relative overflow-hidden rounded-xl border app-border bg-[var(--app-panel)] px-4 py-4 ${index === 4 ? "col-span-2 lg:col-span-1" : ""}`}>
                <span aria-hidden className={`absolute inset-x-0 top-0 h-px ${index === 1 ? (model.netProfit >= 0 ? "bg-profit/70" : "bg-loss/70") : "bg-brand-400/55"}`} />
                <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] app-muted">{label}<MetricInfo term={label} /></p>
                <p className={`mt-2.5 font-mono text-xl font-semibold tracking-tight ${tone}`}>{value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)]">
            <section className="min-w-0 rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-[0_18px_55px_-38px_rgba(0,0,0,0.9)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Equity curve</p><p className="mt-1 text-xs app-muted">Realised account equity after each closed trade</p></div>
                <div className="flex items-center gap-3">
                  {samplePreviewButton}
                  <div className="inline-flex rounded-lg bg-[var(--app-panel-2)] p-1">
                    {["1M", "3M", "1Y", "All"].map((value) => <button key={value} type="button" onClick={() => setRange(value)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${range === value ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted"}`}>{value}</button>)}
                  </div>
                </div>
              </div>
              <div className="relative mt-5 overflow-hidden rounded-xl bg-[var(--app-panel-2)]/55">
                <svg viewBox="0 0 920 280" preserveAspectRatio="none" className="h-72 w-full" role="img" aria-label={model.closedTrades ? "Account equity history" : "Equity chart awaiting closed trades"}>
                  <defs><linearGradient id="prototype-equity" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22c55e" stopOpacity=".22"/><stop offset="1" stopColor="#22c55e" stopOpacity="0"/></linearGradient><pattern id="prototype-grid" width="115" height="56" patternUnits="userSpaceOnUse"><path d="M115 0H0V56" fill="none" stroke="currentColor" strokeOpacity=".07"/></pattern></defs>
                  <rect width="920" height="280" fill="url(#prototype-grid)" className="app-muted" />
                  {model.closedTrades > 0 && <><path d={`${equityPath} L904,264 L16,264 Z`} fill="url(#prototype-equity)" /><path d={equityPath} fill="none" stroke="#22c55e" strokeWidth="2.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></>}
                </svg>
                {model.closedTrades > 0 ? <div className="absolute inset-x-4 bottom-3 flex justify-between text-[10px] app-muted"><span>{chartPeriod.startTime ? formatNewYorkDate(chartPeriod.startTime, { month: "short", year: "numeric" }) : "Start"}</span><span className="text-profit">━ Equity</span><span>{model.closedTrades} trades</span><span>{chartPeriod.endTime ? formatNewYorkDate(chartPeriod.endTime, { month: "short", year: "numeric" }) : "Now"}</span></div> : <div className="absolute inset-0 grid place-items-center px-6 text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl border app-border bg-[var(--app-panel)] text-brand-300"><LineChart size={18} aria-hidden /></span><h2 className="mt-4 text-base font-semibold">No closed trades yet</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 app-muted">Close a trade in this session to calculate the equity curve, win rate, expectancy, and drawdown.</p></div></div>}
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border app-border bg-[var(--app-panel)] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">Trade results</p><p className="mt-1 text-xs app-muted">Realised P/L for the latest 20 trades</p></div>{overviewTradePnls.length > 0 && <span className="rounded-full bg-[var(--app-panel-2)] px-2.5 py-1 font-mono text-[9px] app-muted">{overviewTradePnls.length} trades</span>}</div>
              {overviewTradePnls.length > 0 ? <div className="mt-5"><div className="grid h-[226px] items-center gap-1 rounded-xl bg-[var(--app-panel-2)]/35 px-3 py-4" style={{ gridTemplateColumns: `repeat(${overviewTradePnls.length}, minmax(3px, 1fr))` }}>{overviewTradePnls.map((value, index) => { const height = Math.max(6, Math.abs(value) / overviewTradePnlMax * 88); return <div key={`${index}-${value}`} className="flex h-full min-w-0 flex-col justify-center" title={`Trade ${Math.max(1, model.closedTrades - overviewTradePnls.length + index + 1)}: ${money(value, true)}`}><div className="relative h-1/2 border-b border-white/10">{value > 0 && <div className="absolute bottom-0 left-1/2 w-[72%] -translate-x-1/2 rounded-t bg-profit/85" style={{ height: `${height}%` }} />}</div><div className="relative h-1/2">{value < 0 && <div className="absolute left-1/2 top-0 w-[72%] -translate-x-1/2 rounded-b bg-loss/85" style={{ height: `${height}%` }} />}</div></div>; })}</div><div className="mt-3 flex items-center justify-between text-[10px] app-muted"><span>Older</span><span className="inline-flex items-center gap-3"><i className="inline-flex items-center gap-1.5"><b className="h-1.5 w-1.5 rounded-full bg-profit" /> Profit</i><i className="inline-flex items-center gap-1.5"><b className="h-1.5 w-1.5 rounded-full bg-loss" /> Loss</i></span><span>Latest</span></div></div> : <div className="mt-5 grid h-[276px] place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/35 px-6 text-center"><div><BarChart3 size={20} className="mx-auto text-cyan-300/70" aria-hidden /><p className="mt-3 text-sm font-semibold">Trade results appear here</p><p className="mt-1 text-xs app-muted">Close a trade to plot its realised P/L</p></div></div>}
            </section>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Consistency</p><h2 className="mt-1 text-sm font-semibold">Monthly returns</h2></div><span className="font-mono text-[10px] app-muted">Last 12 months</span></div>
              {model.monthlyReturns.length ? <div className="mt-5 flex h-40 items-center gap-2 border-b app-border px-1">{model.monthlyReturns.slice(-12).map((month) => { const height = Math.max(8, Math.abs(month.percent) / overviewMonthMax * 70); return <div key={month.key} className="flex h-full min-w-0 flex-1 flex-col justify-center"><div className="relative h-1/2 border-b border-white/10">{month.percent > 0 && <div className="absolute bottom-0 left-1/2 w-[70%] -translate-x-1/2 rounded-t bg-profit/80" style={{ height: `${height}%` }} />}</div><div className="relative h-1/2">{month.percent < 0 && <div className="absolute left-1/2 top-0 w-[70%] -translate-x-1/2 rounded-b bg-loss/80" style={{ height: `${height}%` }} />}</div><span className="mt-1 truncate text-center text-[8px] app-muted">{month.label}</span></div>; })}</div> : <div className="mt-5 grid h-40 place-items-center rounded-xl border border-dashed app-border text-xs app-muted">No monthly returns yet</div>}
            </article>

            <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 sm:p-5">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-300">Trade outcomes</p><h2 className="mt-1 text-sm font-semibold">R-multiple distribution</h2></div>
              {model.closedTrades > 0 ? <div className="mt-5 grid h-40 grid-cols-6 items-end gap-2 border-b app-border px-1">{model.rDistribution.map((bucket) => <div key={bucket.label} className="flex h-full flex-col justify-end text-center"><span className="mb-2 font-mono text-[9px] app-muted">{bucket.count}</span><div className={`mx-auto w-[72%] rounded-t ${bucket.label.startsWith("+") || bucket.label.startsWith(">") ? "bg-profit/75" : bucket.label === "0R" ? "bg-white/20" : "bg-loss/75"}`} style={{ height: `${Math.max(bucket.count ? 10 : 0, bucket.count / overviewRMax * 72)}%` }} /><span className="mt-2 pb-2 text-[8px] app-muted">{bucket.label}</span></div>)}</div> : <div className="mt-5 grid h-40 place-items-center rounded-xl border border-dashed app-border text-xs app-muted">No trade outcomes yet</div>}
            </article>

            <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 sm:p-5">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">Market timing</p><h2 className="mt-1 text-sm font-semibold">Performance by session</h2></div>
              {model.sessions.length ? <div className="mt-5 space-y-4">{model.sessions.slice(0, 4).map((session) => <div key={session.label}><div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold">{session.label}</span><span className={`font-mono font-semibold ${session.value >= 0 ? "text-profit" : "text-loss"}`}>{money(session.value, true)}</span></div><div className="mt-2 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${session.value >= 0 ? "bg-cyan-400" : "bg-loss"}`} style={{ width: `${Math.max(10, Math.abs(session.value) / overviewSessionMax * 100)}%` }} /></div><span className="w-8 text-right font-mono text-[9px] app-muted">{session.rate}%</span></div></div>)}</div> : <div className="mt-5 grid h-40 place-items-center rounded-xl border border-dashed app-border text-xs app-muted">No market-session results yet</div>}
            </article>
          </section>

          <ProjectAnalyticsOverview model={model} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
            <TradingActivityCalendar months={model.calendarMonths} />

            <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Execution</p><h2 className="mt-1 text-lg font-semibold">Recent trades</h2></div><button type="button" onClick={() => setTab("trades")} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300">View all <ArrowUpRight size={13}/></button></div>
              <div className="mt-4 divide-y app-border">
                {model.recentTrades.length ? model.recentTrades.map((trade)=><article key={`${trade.time}-${trade.pair}`} className="flex items-center gap-3 py-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${trade.positive ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{trade.positive ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-xs font-semibold">{trade.pair} · {trade.side}</p><span className="text-[9px] app-muted">{trade.r}</span></div><p className="mt-1 truncate text-[10px] app-muted">{trade.setup} · {trade.time}</p></div><p className={`shrink-0 font-mono text-xs font-semibold ${trade.positive ? "text-profit" : "text-loss"}`}>{trade.result}</p></article>) : <p className="py-8 text-center text-xs app-muted">Close a trade to populate execution history.</p>}
              </div>
            </section>
          </div>

          <section className="grid gap-4 lg:grid-cols-2">
            {[
              { icon: Target, label: "Best exit profile", value: model.exits.slice().sort((a,b)=>b.value-a.value)[0]?.label ?? "No trade data", detail: model.exits.length ? `${money(model.exits.slice().sort((a,b)=>b.value-a.value)[0]!.value, true)} across ${model.exits.slice().sort((a,b)=>b.value-a.value)[0]!.trades} trades` : "Close trades to reveal the pattern" },
              { icon: LineChart, label: "Best market window", value: model.sessions.slice().sort((a,b)=>b.value-a.value)[0]?.label ?? "No trade data", detail: model.sessions.length ? `${model.sessions.slice().sort((a,b)=>b.value-a.value)[0]!.rate}% win rate · ${money(model.sessions.slice().sort((a,b)=>b.value-a.value)[0]!.value, true)}` : "Close trades to reveal the pattern" },
            ].map(({icon:Icon,label,value,detail})=><article key={label} className="rounded-xl bg-[var(--app-panel)] p-4"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] app-muted"><Icon size={15}/></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">{label}</p><h3 className="mt-1.5 text-sm font-semibold">{value}</h3><p className="mt-1 text-xs app-muted">{detail}</p></div></div></article>)}
          </section>
        </main>
      )}

      {tab === "trades" && <section className="mt-5 overflow-hidden rounded-2xl bg-[var(--app-panel)]"><div className="flex flex-wrap items-end justify-between gap-3 border-b app-border p-5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Execution ledger</p><h2 className="mt-1 text-xl font-semibold">Trades included in analytics</h2></div>{demo && <span className="rounded-full bg-amber-300/10 px-3 py-1 text-[10px] font-semibold text-amber-200">{DEMO_ANALYTICS_SCOPED_TRADES.length} sample trades</span>}</div><TradesTable trades={demo ? DEMO_ANALYTICS_SCOPED_TRADES : scopedTrades} focusedTrade={demo ? null : focusedTrade} /></section>}
      {tab === "journal" && (demo ? <DemoJournalWorkspace /> : journalContent ?? <PrototypePlaceholder icon={NotebookPen} title="Trading journal" description="Journal entries for this session will appear here." />)}
      {tab === "reports" && <><ReportsWorkspace model={model} periodLabel={periodLabel} sessionId={demo ? undefined : sessionId} /><ExitQualityCard trades={demo ? DEMO_ANALYTICS_SCOPED_TRADES : scopedTrades} plan={demo ? DEMO_EXIT_QUALITY : exitQuality} planUnavailable={status !== "finished" ? "Available once this session is complete. Working out what a trade would have done needs candles the replay has not shown you yet." : "No trade was closed by hand with a stop or target still to resolve, so there is nothing to test."} />{!demo && reportFooter}</>}
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
  // The column count varies with whether the weekend is in play, and Tailwind
  // cannot emit an interpolated `grid-cols-${n}`.
  const columns = { gridTemplateColumns: `repeat(${month.weekdays.length}, minmax(0, 1fr))` };

  return (
    <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Consistency</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">Trading activity<MetricInfo term="Trading activity" detail="Each cell is one day's realised profit or loss, placed on the day the trade closed, in New York time. Only months containing a trade are shown, and the weekend is left out unless a trade closed in it — forex is shut from Friday evening until the Sunday 5pm New York reopen." /></h2>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setIndex(position - 1)} disabled={position === 0} aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-md app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft size={15} aria-hidden /></button>
          <span className="inline-flex min-w-[9.5rem] items-center justify-center gap-1.5 text-xs font-semibold app-muted"><CalendarDays size={14} aria-hidden /> {month.label}</span>
          <button type="button" onClick={() => setIndex(position + 1)} disabled={position === months.length - 1} aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-md app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight size={15} aria-hidden /></button>
        </div>
      </div>
      <div className="mt-4 grid gap-1.5 text-center text-[9px] app-muted" style={columns}>{month.weekdays.map((weekday)=><span key={weekday} className="py-1">{WEEKDAY_LABELS[weekday]}</span>)}</div>
      <div className="mt-1 grid gap-1.5" style={columns}>
        {month.cells.map((cell,cellIndex)=><div key={cellIndex} className={`relative min-h-16 rounded-lg p-2 ${cell.day == null ? "bg-white/[0.015]" : cell.value! > 0 ? "bg-profit/[0.12]" : cell.value! < 0 ? "bg-loss/[0.12]" : "bg-white/[0.035]"}`}><span className="text-[9px] app-muted">{cell.day}</span>{cell.value != null && cell.value !== 0 && <p className={`mt-2 truncate font-mono text-[10px] font-semibold ${cell.value > 0 ? "text-profit" : "text-loss"}`}>{money(cell.value, true)}</p>}</div>)}
      </div>
      <p className="mt-3 text-[11px] app-muted">
        {months.length === 1 ? "One month of trading" : `Month ${position + 1} of ${months.length}`} ·{" "}
        <span className={total > 0 ? "font-semibold text-profit" : total < 0 ? "font-semibold text-loss" : "font-semibold"}>{money(total, true)}</span> this month
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
      tone: "text-profit",
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
      tone: "text-loss",
      rows: [
        ["Maximum drawdown", drawdownMoney(model.maxDrawdown)],
        ["Recovery factor", ratio(model.recoveryFactor)],
        ["Maximum lot used", model.maxLot.toFixed(2)],
        ["Average trade", money(model.averageTrade, true)],
      ],
    },
  ] as const;

  return (
    <section className="rounded-2xl bg-[var(--app-panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Detailed metrics</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">Session breakdown<MetricInfo term="Session breakdown" detail="Coverage, execution, results, and risk for this session." /></h2></div>
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
    exitTime: trade.exitTime,
    symbol: trade.symbol ?? null,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    stopLoss: trade.initialStopLoss ?? trade.stopLoss,
    takeProfit: trade.initialTakeProfit ?? trade.takeProfit,
    pnl: trade.pnl,
    maxFavorablePnl: trade.maxFavorablePnl ?? null,
    maxAdversePnl: trade.maxAdversePnl ?? null,
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


function ReportsWorkspace({ model, periodLabel, sessionId }: { model: AnalyticsModel; periodLabel: string; sessionId?: string }) {
  const monthPercents = model.monthlyReturns.map((month) => month.percent);
  const bestMonth = Math.max(...monthPercents, 0);
  const worstMonth = Math.min(...monthPercents, 0);
  const averageMonth = monthPercents.reduce((sum, value) => sum + value, 0) / Math.max(1, monthPercents.length);
  const positiveMonths = monthPercents.filter((value) => value > 0).length;
  const monthsTested = model.monthlyReturns.length;
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
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs app-muted">All {model.closedTrades} closed trades · {periodLabel} <ReportTimeZone sessionId={sessionId} /></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold app-muted"><CalendarDays size={14} /> Entire test</button>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold app-muted"><BarChart3 size={14} /> Closed trades</button>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border app-border bg-[var(--app-border)] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Return / drawdown", model.maxDrawdown ? ratio(model.recoveryFactor) : "—", model.netProfit >= 0 ? "Positive" : "Needs attention"],
          ["Maximum drawdown", drawdownMoney(model.maxDrawdown), model.maxDrawdownPercent === null ? "No equity history recorded" : `${model.maxDrawdownPercent.toFixed(1)}% from peak`],
          ["Positive months", monthsTested ? `${positiveMonths} of ${monthsTested}` : "—", monthsTested ? `${Math.round(positiveMonths / monthsTested * 100)}% consistency` : "No month completed yet"],
          ["Statistical confidence", sampleIsReliable(model.closedTrades) ? "Established" : "Developing", sampleIsReliable(model.closedTrades) ? `${RELIABLE_SAMPLE_TRADES}+ trade sample` : `${tradesUntilReliable(model.closedTrades)} more trades needed`],
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
          <InteractiveDrawdownChart values={model.drawdown} maxDrawdown={model.maxDrawdown} closedTrades={model.closedTrades} />
        </ReportCard>

        <ReportCard eyebrow="Risk diagnosis" title="What the drawdown says" icon={Gauge} info="The worst decline set against what the strategy earned, so the reward can be judged against the risk it took rather than on its own.">
          <div className="mt-5 rounded-xl border app-border p-4">
            <div className="flex items-end justify-between"><div><p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] app-muted">Maximum depth<MetricInfo term="Maximum depth" /></p><p className={`mt-1 font-mono text-2xl font-semibold ${model.maxDrawdownPercent === null ? "app-muted" : "text-loss"}`}>{model.maxDrawdownPercent === null ? "—" : `−${model.maxDrawdownPercent.toFixed(2)}%`}</p></div><p className="font-mono text-xs app-muted">{drawdownMoney(model.maxDrawdown)}</p></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-loss" style={{ width: `${Math.min(100, (model.maxDrawdownPercent ?? 0) / 4 * 100)}%` }} /></div>
            <p className="mt-2 text-[10px] app-muted">{model.maxDrawdownPercent === null ? "No equity history was recorded for this session, so its drawdown cannot be measured." : `${drawdownPercent(model.maxDrawdownPercent)} maximum equity decline`}</p>
          </div>
          <dl className="mt-4 divide-y app-border">
            {[["Net realised P/L", money(model.netProfit, true)], ["Closed trades", String(model.closedTrades)], ["Return", percentage(model.returnPercent)], ["Ending equity", money(model.endingBalance)]].map(([label, value]) => <div key={label} className="flex justify-between py-3 text-xs"><dt className="flex items-center gap-1.5 app-muted">{label}<MetricInfo term={label!} /></dt><dd className="font-mono font-semibold">{value}</dd></div>)}
          </dl>
        </ReportCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
        <ReportCard eyebrow="Consistency" title="Monthly returns" icon={BarChart3} info="One bar per calendar month the test covered, as a percentage of the starting balance. A month inside the span with no trades is kept at zero, because it is a real month of the test that returned nothing. Look for how evenly the profit arrives — a year made in one month is far harder to trade live than the same year spread across twelve.">
          {monthsTested === 0 ? (
            <p className="mt-6 py-12 text-center text-xs app-muted">Close a trade to record a month.</p>
          ) : (
          <div className="mt-6 grid h-56 items-center gap-2 border-b app-border px-1" style={{ gridTemplateColumns: `repeat(${monthsTested}, minmax(0, 1fr))` }}>
            {model.monthlyReturns.map((month) => {
              const height = Math.max(month.percent === 0 ? 0 : 12, Math.abs(month.percent) / Math.max(Math.abs(bestMonth), Math.abs(worstMonth), 0.01) * 86);
              // Beyond a year or so there is no room for twelve labels a year,
              // so only each January is named, and it carries its year.
              const dense = monthsTested > 14;
              const caption = dense ? (month.month === 1 ? String(month.year) : "") : month.label;
              return (
                <div key={month.key} className="flex h-full flex-col items-center justify-center">
                  <div className="flex h-[172px] w-full flex-col justify-center">
                    <div className="relative h-1/2 border-b border-white/10">
                      {month.percent > 0 && <div className="absolute bottom-0 left-1/2 w-[72%] -translate-x-1/2 rounded-t bg-profit/80" style={{ height: `${height}%` }} />}
                    </div>
                    <div className="relative h-1/2">
                      {month.percent < 0 && <div className="absolute left-1/2 top-0 w-[72%] -translate-x-1/2 rounded-b bg-loss/80" style={{ height: `${height}%` }} />}
                    </div>
                  </div>
                  <span className="mt-2 truncate text-[9px] app-muted" title={`${month.label} ${month.year}`}>{caption}</span>
                </div>
              );
            })}
          </div>
          )}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs"><span className="app-muted">Best month <b className="ml-1 font-mono text-profit">{percentage(bestMonth)}</b></span><span className="app-muted">Worst month <b className="ml-1 font-mono text-loss">{percentage(worstMonth)}</b></span><span className="app-muted">Average <b className="ml-1 font-mono text-[var(--app-text)]">{percentage(averageMonth)}</b></span></div>
        </ReportCard>

        <ReportCard eyebrow="Market timing" title="Performance by session" icon={Clock3} info="Results grouped by the market window a trade was opened in, using New York time. Bar length is profit; the figure on the right is that window's win rate.">
          <div className="mt-5 space-y-5">
            {model.sessions.map((session) => (
              <div key={session.label}>
                <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{session.label}</span><span className={`font-mono font-semibold ${session.value >= 0 ? "text-profit" : "text-loss"}`}>{session.value >= 0 ? "+" : "−"}${Math.abs(session.value).toLocaleString()}</span></div>
                <div className="mt-2 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${session.value >= 0 ? "bg-profit" : "bg-loss"}`} style={{ width: `${Math.max(12, Math.abs(session.value) / sessionMax * 100)}%` }} /></div><span className="w-8 text-right font-mono text-[9px] app-muted">{session.rate}%</span></div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-profit/[0.07] p-3 text-xs leading-5 app-muted">{bestSession ? <><b className="text-profit">{bestSession.label}</b> currently leads with {money(bestSession.value, true)} and a {bestSession.rate}% win rate.</> : "Close trades in different market windows to compare session performance."}</div>
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard eyebrow="Timing" title="Performance by weekday" icon={CalendarDays} info="Results grouped by the New York weekday a trade was opened on. With fewer than about a hundred trades there are only a handful in each day, so treat a standout day as a question rather than a finding.">
          <div className="mt-5 space-y-4">
            {model.weekdays.map((day) => (
              <div key={day.label} className="grid grid-cols-[34px_minmax(0,1fr)_72px] items-center gap-3 text-xs">
                <span className="font-semibold">{day.label}</span>
                <div className="h-7 overflow-hidden rounded-md bg-white/[0.035]"><div className={`flex h-full items-center rounded-md px-2 ${day.value >= 0 ? "bg-profit/15" : "bg-loss/15"}`} style={{ width: `${Math.max(18, Math.abs(day.value) / weekdayMax * 100)}%` }}><span className="text-[9px] app-muted">{day.trades} trades</span></div></div>
                <span className={`text-right font-mono font-semibold ${day.value >= 0 ? "text-profit" : "text-loss"}`}>{day.value >= 0 ? "+" : "−"}${Math.abs(day.value)}</span>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard eyebrow="Trade outcomes" title="R-multiple distribution" icon={Target} info="Each bar counts the trades that finished in that band. Trades with no recorded initial risk cannot be converted to R and are left out of this chart.">
          <div className="mt-6 grid h-44 grid-cols-6 items-end gap-3 border-b app-border px-2">
            {model.rDistribution.map((bucket) => <div key={bucket.label} className="flex h-full flex-col justify-end text-center"><span className="mb-2 font-mono text-[10px] app-muted">{bucket.count}</span><div className={`mx-auto w-[72%] rounded-t ${bucket.label.startsWith("+") || bucket.label.startsWith(">") ? "bg-profit/75" : bucket.label === "0R" ? "bg-white/20" : "bg-loss/75"}`} style={{ height: `${bucket.count / rMax * 80}%` }} /><span className="mt-2 pb-2 text-[9px] app-muted">{bucket.label}</span></div>)}
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
                  <div><p className="font-semibold">{exit.label}</p><div className="mt-2 h-1 w-full max-w-48 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${exit.value >= 0 ? "bg-profit" : "bg-loss"}`} style={{ width: `${Math.max(10, Math.abs(exit.value) / exitMax * 100)}%` }} /></div></div>
                  <span className="font-mono app-muted">{exit.trades}</span>
                  <span className="font-mono">{exit.winRate}%</span>
                  <span className={`text-right font-mono font-semibold ${exit.value > 0 ? "text-profit" : exit.value < 0 ? "text-loss" : "app-muted"}`}>{exit.value > 0 ? "+" : exit.value < 0 ? "−" : ""}${Math.abs(exit.value).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </ReportCard>

        <ReportCard eyebrow="Risk allocation" title="Performance by position size" icon={BarChart3} info="Which position sizes actually produced the profit. Compare a size bucket's contribution with the drawdown it caused before deciding to increase risk — a bucket can lead on profit and still be the one that hurt most.">
          <div className="mt-5 space-y-5">
            {model.sizes.map((bucket) => (
              <div key={bucket.label}>
                <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold">{bucket.label}</p><p className="mt-1 text-[9px] app-muted">{bucket.trades} trades · {bucket.share}% of positive P/L</p></div><p className={`font-mono text-xs font-semibold ${bucket.value >= 0 ? "text-profit" : "text-loss"}`}>{money(bucket.value, true)}</p></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-profit" style={{ width: `${bucket.share}%` }} /></div>
              </div>
            ))}
          </div>
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard eyebrow="Direction" title="Long versus short" icon={TrendingUp} info="Whether the edge works in both directions. Compare these before filtering the next test plan — but a lopsided result on a small sample is usually a few outlier trades rather than a real bias.">
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-400/[0.07] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">Long</p><p className={`mt-2 font-mono text-xl font-semibold ${model.directions.long.value >= 0 ? "text-profit" : "text-loss"}`}>{money(model.directions.long.value, true)}</p><p className="mt-1 text-[10px] app-muted">{model.directions.long.trades} trades · {model.directions.long.rate}% won</p></div>
            <div className="rounded-xl bg-white/[0.025] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">Short</p><p className={`mt-2 font-mono text-xl font-semibold ${model.directions.short.value >= 0 ? "text-profit" : "text-loss"}`}>{money(model.directions.short.value, true)}</p><p className="mt-1 text-[10px] app-muted">{model.directions.short.trades} trades · {model.directions.short.rate}% won</p></div>
          </div>
        </ReportCard>

        <ReportCard eyebrow="Trade management" title="Performance by holding time" icon={Clock3} info="How long a trade was open, against what it made. Use it to tell whether you are exiting too early or overstaying — a negative short-hold bucket usually means trades are being cut before the setup has had time to work.">
          <div className="mt-5 space-y-3">
            {model.holding.map((bucket) => (
              <div key={bucket.label} className="grid grid-cols-[76px_minmax(0,1fr)_72px] items-center gap-2 text-[10px]">
                <span className="app-muted">{bucket.label}</span>
                <div className="h-5 overflow-hidden rounded bg-white/[0.035]"><div className={`h-full rounded ${bucket.value >= 0 ? "bg-profit/20" : "bg-loss/20"}`} style={{ width: `${Math.max(12, Math.abs(bucket.value) / holdMax * 100)}%` }} /></div>
                <span className={`text-right font-mono font-semibold ${bucket.value >= 0 ? "text-profit" : "text-loss"}`}>{bucket.value >= 0 ? "+" : "−"}${Math.abs(bucket.value)}</span>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard eyebrow="Robustness" title="Profit concentration" icon={ShieldCheck}>
          <div className="mt-5 flex items-center gap-5">
            <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#22c55e 0 ${model.concentration}%, rgba(255,255,255,.08) ${model.concentration}% 100%)` }}><div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[var(--app-panel)]"><div className="text-center"><p className="font-mono text-lg font-semibold">{model.concentration.toFixed(0)}%</p><p className="text-[8px] app-muted">top 3</p></div></div></div>
            <div><p className="text-xs font-semibold">{model.concentration <= 50 ? "Profit is reasonably distributed" : "Profit is concentrated"}</p><p className="mt-2 text-xs leading-5 app-muted">The three largest winners produce {model.concentration.toFixed(0)}% of net profit.</p></div>
          </div>
          <dl className="mt-4 divide-y app-border"><div className="flex justify-between py-2.5 text-xs"><dt className="flex items-center gap-1.5 app-muted">Best trade<MetricInfo term="Best trade" /></dt><dd className="font-mono font-semibold text-profit">{money(model.bestTrade, true)}</dd></div><div className="flex justify-between py-2.5 text-xs"><dt className="flex items-center gap-1.5 app-muted">Top-three contribution<MetricInfo term="Top-three contribution" /></dt><dd className="font-mono font-semibold">{model.concentration.toFixed(1)}%</dd></div></dl>
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
