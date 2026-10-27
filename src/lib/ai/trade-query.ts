/**
 * The questions the AI Analyst's tools can ask of a trader's trades: filter,
 * group, summarise, and "what if I had skipped these". Pure, so every number
 * the AI quotes from a tool is computed here and can be tested.
 */

import { getNewYorkDateParts, getTradingSession, type TradingSession } from "@/lib/date-time";

export interface BookTrade {
  /** The trade's number within its session, as the analytics ledger counts it. */
  number: number;
  sessionId: string;
  /** Short, stable label for the session used in citations: [#12@ref]. */
  sessionRef: string;
  sessionName: string;
  symbol: string;
  direction: "long" | "short";
  entryTime: number;
  exitTime: number;
  pnl: number;
  pips: number;
  exitReason: string;
  /** Realised R, when the trade had a stop to measure risk against. */
  r: number | null;
  notes: string | null;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const TRADING_SESSIONS: TradingSession[] = ["Asia", "London", "New York", "Rollover"];

export interface TradeFilter {
  session?: string;
  symbol?: string;
  direction?: "long" | "short";
  outcome?: "win" | "loss";
  weekdays?: string[];
  tradingSessions?: string[];
  /** New York entry hour range, inclusive, 0 to 23. */
  entryHourFrom?: number;
  entryHourTo?: number;
  exitReason?: string;
  minHoldMinutes?: number;
  maxHoldMinutes?: number;
  from?: number;
  to?: number;
}

/** Turns a session reference the AI passes (its ref, id or name) into a session id. */
export function matchSession(trades: BookTrade[], session: string): string | null {
  const needle = session.trim().toLowerCase();
  const hit = trades.find((trade) => trade.sessionRef === needle || trade.sessionId.toLowerCase() === needle)
    ?? trades.find((trade) => trade.sessionName.toLowerCase() === needle);
  return hit?.sessionId ?? null;
}

function sameSymbol(a: string, b: string): boolean {
  const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean(a) === clean(b);
}

export function holdMinutes(trade: BookTrade): number {
  return Math.round((trade.exitTime - trade.entryTime) / 60_000);
}

export function filterTrades(trades: BookTrade[], filter: TradeFilter): BookTrade[] {
  const sessionId = filter.session ? matchSession(trades, filter.session) : null;
  const weekdays = filter.weekdays?.map((day) => day.trim().toLowerCase().slice(0, 3));
  const sessions = filter.tradingSessions?.map((name) => name.trim().toLowerCase());
  const reason = filter.exitReason?.trim().toLowerCase();
  return trades.filter((trade) => {
    if (filter.session && trade.sessionId !== sessionId) return false;
    if (filter.symbol && !sameSymbol(trade.symbol, filter.symbol)) return false;
    if (filter.direction && trade.direction !== filter.direction) return false;
    if (filter.outcome === "win" && trade.pnl <= 0) return false;
    if (filter.outcome === "loss" && trade.pnl >= 0) return false;
    const parts = getNewYorkDateParts(trade.entryTime);
    if (weekdays?.length && !weekdays.includes(WEEKDAY_NAMES[parts.weekday]!.toLowerCase().slice(0, 3))) return false;
    if (sessions?.length && !sessions.includes(getTradingSession(trade.entryTime).toLowerCase())) return false;
    if (filter.entryHourFrom !== undefined || filter.entryHourTo !== undefined) {
      const from = filter.entryHourFrom ?? 0;
      const to = filter.entryHourTo ?? 23;
      // A range like 20 to 2 wraps past midnight.
      const inside = from <= to ? parts.hour >= from && parts.hour <= to : parts.hour >= from || parts.hour <= to;
      if (!inside) return false;
    }
    if (reason && trade.exitReason.toLowerCase() !== reason) return false;
    const held = holdMinutes(trade);
    if (filter.minHoldMinutes !== undefined && held < filter.minHoldMinutes) return false;
    if (filter.maxHoldMinutes !== undefined && held > filter.maxHoldMinutes) return false;
    if (filter.from !== undefined && trade.entryTime < filter.from) return false;
    if (filter.to !== undefined && trade.entryTime > filter.to) return false;
    return true;
  });
}

export interface TradeSummary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  net: number;
  averageWin: number | null;
  averageLoss: number | null;
  profitFactor: number | null;
  averageR: number | null;
  /** Largest peak-to-trough fall of the running P/L, as a positive amount. */
  maxDrawdown: number;
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

export function summarise(trades: BookTrade[]): TradeSummary {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = -losses.reduce((sum, trade) => sum + trade.pnl, 0);
  const rs = trades.map((trade) => trade.r).filter((r): r is number => r !== null);
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of [...trades].sort((a, b) => a.exitTime - b.exitTime)) {
    running += trade.pnl;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : null,
    net: round(trades.reduce((sum, trade) => sum + trade.pnl, 0)),
    averageWin: wins.length ? round(grossWin / wins.length) : null,
    averageLoss: losses.length ? round(grossLoss / losses.length) : null,
    profitFactor: grossLoss ? round(grossWin / grossLoss) : null,
    averageR: rs.length ? round(rs.reduce((sum, r) => sum + r, 0) / rs.length) : null,
    maxDrawdown: round(maxDrawdown),
  };
}

export type GroupBy = "symbol" | "weekday" | "hour" | "tradingSession" | "direction" | "exitReason" | "session" | "month";
export const GROUP_BY: GroupBy[] = ["symbol", "weekday", "hour", "tradingSession", "direction", "exitReason", "session", "month"];

function groupKey(trade: BookTrade, by: GroupBy): { key: string; order: number } {
  const parts = getNewYorkDateParts(trade.entryTime);
  switch (by) {
    case "symbol": return { key: trade.symbol, order: 0 };
    case "weekday": return { key: WEEKDAY_NAMES[parts.weekday]!, order: parts.weekday };
    case "hour": return { key: `${String(parts.hour).padStart(2, "0")}:00`, order: parts.hour };
    case "tradingSession": {
      const session = getTradingSession(trade.entryTime);
      return { key: session, order: TRADING_SESSIONS.indexOf(session) };
    }
    case "direction": return { key: trade.direction === "long" ? "Buy" : "Sell", order: trade.direction === "long" ? 0 : 1 };
    case "exitReason": return { key: trade.exitReason, order: 0 };
    case "session": return { key: `${trade.sessionName} (${trade.sessionRef})`, order: 0 };
    case "month": {
      const date = new Date(trade.entryTime);
      return { key: date.toISOString().slice(0, 7), order: date.getUTCFullYear() * 12 + date.getUTCMonth() };
    }
  }
}

export interface GroupRow extends TradeSummary {
  group: string;
}

/** Rows in natural order for time-like groupings, otherwise worst net first. */
export function groupTrades(trades: BookTrade[], by: GroupBy): GroupRow[] {
  const groups = new Map<string, { order: number; trades: BookTrade[] }>();
  for (const trade of trades) {
    const { key, order } = groupKey(trade, by);
    const group = groups.get(key) ?? { order, trades: [] };
    group.trades.push(trade);
    groups.set(key, group);
  }
  const ordered = ["weekday", "hour", "tradingSession", "direction", "month"].includes(by);
  return [...groups.entries()]
    .sort((a, b) => (ordered ? a[1].order - b[1].order : summarise(a[1].trades).net - summarise(b[1].trades).net))
    .map(([group, value]) => ({ group, ...summarise(value.trades) }));
}

export interface SkipComparison {
  actual: TradeSummary;
  withoutSkipped: TradeSummary;
  skipped: TradeSummary;
}

/** "What if I had not taken these trades": the same trades with the matched ones left out. */
export function compareWithout(trades: BookTrade[], skip: TradeFilter): SkipComparison {
  const skipped = filterTrades(trades, skip);
  const skippedSet = new Set(skipped);
  return {
    actual: summarise(trades),
    withoutSkipped: summarise(trades.filter((trade) => !skippedSet.has(trade))),
    skipped: summarise(skipped),
  };
}

/** The citation the AI writes for a trade, which the page turns into a link. */
export function citation(trade: BookTrade): string {
  return `[#${trade.number}@${trade.sessionRef}]`;
}

/** Last six characters of a session id: short, and stable as sessions are renamed or reordered. */
export function sessionRef(sessionId: string): string {
  return sessionId.slice(-6).toLowerCase();
}
