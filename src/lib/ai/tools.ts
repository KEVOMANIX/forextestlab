import "server-only";

import { analyticsTrades } from "@/lib/analytics/trade-scope";
import { testTradePlan, type PlanConfig } from "@/lib/backtest/exit-quality";
import { configForSymbol, recordSymbol } from "@/lib/backtest/instrument-config";
import { readSavedSessionState } from "@/lib/backtest/saved-session-state";
import type { ClosedTrade, SessionState } from "@/lib/backtest/types";
import { formatNewYorkDate, formatNewYorkDateTime } from "@/lib/date-time";
import { prisma } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { getMarketDataProvider } from "@/lib/market-data";
import { formatSymbol } from "@/lib/market-data/symbols";
import {
  GROUP_BY,
  TRADING_SESSIONS,
  WEEKDAY_NAMES,
  citation,
  compareWithout,
  filterTrades,
  groupTrades,
  holdMinutes,
  matchSession,
  sessionRef,
  summarise,
  type BookTrade,
  type GroupBy,
  type TradeFilter,
} from "@/lib/ai/trade-query";

/** Portfolio questions read this many of the trader's most recently used sessions. */
export const BOOK_SESSION_LIMIT = 40;
const MAX_LISTED_TRADES = 40;

interface BookSession {
  id: string;
  ref: string;
  name: string;
  state: SessionState;
  trades: ClosedTrade[];
}

export interface TradeBook {
  sessions: BookSession[];
  trades: BookTrade[];
}

function rOf(trade: ClosedTrade): number | null {
  const risk = trade.initialRiskAmount ? Number(trade.initialRiskAmount) : 0;
  return risk > 0 ? Math.round((Number(trade.pnl) / risk) * 100) / 100 : null;
}

/** Every analysed trade in scope, numbered the way the session's own ledger numbers them. */
export async function loadTradeBook(userId: string, sessionId?: string): Promise<TradeBook> {
  const rows = await prisma.backtestSession.findMany({
    where: { userId, anonymous: false, ...(sessionId ? { id: sessionId } : {}) },
    orderBy: { updatedAt: "desc" },
    take: sessionId ? 1 : BOOK_SESSION_LIMIT,
    select: { id: true, symbol: true, stateJson: true, stateObjectKey: true },
  });
  const loaded = await Promise.all(rows.map(async (row) => {
    try {
      return { row, state: await readSavedSessionState(row) };
    } catch {
      // One unreadable snapshot must not take every answer down with it.
      return null;
    }
  }));
  const sessions: BookSession[] = [];
  const trades: BookTrade[] = [];
  for (const item of loaded) {
    if (!item || (!sessionId && item.state.config.archived)) continue;
    const { row, state } = item;
    const session: BookSession = {
      id: row.id,
      ref: sessionRef(row.id),
      name: state.config.name?.trim() || `${formatSymbol(row.symbol)} backtest`,
      state,
      trades: analyticsTrades(state.closedTrades),
    };
    sessions.push(session);
    session.trades.forEach((trade, index) => trades.push({
      number: index + 1,
      sessionId: session.id,
      sessionRef: session.ref,
      sessionName: session.name,
      symbol: formatSymbol(recordSymbol(trade, state.config)),
      direction: trade.direction,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      pnl: Number(trade.pnl),
      pips: Number(trade.pips),
      exitReason: trade.exitReason,
      r: rOf(trade),
      notes: trade.notes?.trim() || null,
    }));
  }
  return { sessions, trades };
}

/* -------------------------------------------------------------------------- */
/* Tool declarations, in the shape Gemini's function calling expects          */
/* -------------------------------------------------------------------------- */

const FILTER_PROPERTIES = {
  session: { type: "STRING", description: "A session's ref (the 6 characters in its citations, e.g. abc123) or its exact name. Leave out for every session in scope." },
  symbol: { type: "STRING", description: "Market, e.g. EUR/USD or XAUUSD." },
  direction: { type: "STRING", enum: ["long", "short"] },
  outcome: { type: "STRING", enum: ["win", "loss"] },
  weekdays: { type: "ARRAY", items: { type: "STRING", enum: [...WEEKDAY_NAMES] }, description: "New York weekday of entry." },
  tradingSessions: { type: "ARRAY", items: { type: "STRING", enum: TRADING_SESSIONS }, description: "Market session of entry, by New York time." },
  entryHourFrom: { type: "INTEGER", description: "New York entry hour, 0 to 23, inclusive. A range can wrap past midnight." },
  entryHourTo: { type: "INTEGER", description: "New York entry hour, 0 to 23, inclusive." },
  exitReason: { type: "STRING", description: "e.g. stop-loss, take-profit, manual, trailing-stop." },
  minHoldMinutes: { type: "INTEGER" },
  maxHoldMinutes: { type: "INTEGER" },
} as const;

export const TOOL_DECLARATIONS = [
  {
    name: "list_sessions",
    description: "List the sessions in scope with their ref, markets, period, status and headline results. Use it to find a session's ref.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "find_trades",
    description: "Find trades matching filters. Returns a summary of all matches (count, win rate, net, profit factor, average R, drawdown) and up to 40 trades with their citation.",
    parameters: {
      type: "OBJECT",
      properties: {
        ...FILTER_PROPERTIES,
        sortBy: { type: "STRING", enum: ["pnl", "time", "hold"], description: "Order of the listed trades. Default time." },
        order: { type: "STRING", enum: ["asc", "desc"] },
        limit: { type: "INTEGER", description: "Trades to list, at most 40. The summary always covers every match." },
      },
    },
  },
  {
    name: "group_trades",
    description: "Break trades down by a dimension and summarise each group (count, win rate, net, profit factor, average R). Optional filters narrow the trades first.",
    parameters: {
      type: "OBJECT",
      properties: { groupBy: { type: "STRING", enum: GROUP_BY }, ...FILTER_PROPERTIES },
      required: ["groupBy"],
    },
  },
  {
    name: "what_if_skipped",
    description: "What the results would have been without the trades matching the filters, e.g. skipping Fridays or the New York session. Exact: it only removes trades.",
    parameters: { type: "OBJECT", properties: FILTER_PROPERTIES },
  },
  {
    name: "what_if_levels",
    description: "Re-run one finished session's trades against the real candles with a different stop and/or target, in pips from each entry. Slower; use for questions like 'what if my stop had been 20 pips'.",
    parameters: {
      type: "OBJECT",
      properties: {
        session: FILTER_PROPERTIES.session,
        stopLossPips: { type: "NUMBER", description: "Stop distance in pips. Leave out to keep each trade's own stop." },
        takeProfitPips: { type: "NUMBER", description: "Target distance in pips. Leave out to keep each trade's own target." },
      },
      required: ["session"],
    },
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Execution                                                                   */
/* -------------------------------------------------------------------------- */

type Args = Record<string, unknown>;

function filterFrom(args: Args): TradeFilter {
  const text = (key: string) => (typeof args[key] === "string" && (args[key] as string).trim() ? (args[key] as string) : undefined);
  const number = (key: string) => (typeof args[key] === "number" && Number.isFinite(args[key]) ? (args[key] as number) : undefined);
  const list = (key: string) => (Array.isArray(args[key]) ? (args[key] as unknown[]).filter((value): value is string => typeof value === "string") : undefined);
  const direction = text("direction");
  const outcome = text("outcome");
  return {
    session: text("session"),
    symbol: text("symbol"),
    direction: direction === "long" || direction === "short" ? direction : undefined,
    outcome: outcome === "win" || outcome === "loss" ? outcome : undefined,
    weekdays: list("weekdays"),
    tradingSessions: list("tradingSessions"),
    entryHourFrom: number("entryHourFrom"),
    entryHourTo: number("entryHourTo"),
    exitReason: text("exitReason"),
    minHoldMinutes: number("minHoldMinutes"),
    maxHoldMinutes: number("maxHoldMinutes"),
  };
}

function tradeRow(trade: BookTrade) {
  return {
    cite: citation(trade),
    session: trade.sessionName,
    market: trade.symbol,
    direction: trade.direction === "long" ? "buy" : "sell",
    entered: formatNewYorkDateTime(trade.entryTime),
    heldMinutes: holdMinutes(trade),
    pnl: trade.pnl,
    pips: trade.pips,
    r: trade.r,
    exit: trade.exitReason,
    ...(trade.notes ? { notes: trade.notes.slice(0, 200) } : {}),
  };
}

async function whatIfLevels(book: TradeBook, args: Args) {
  const id = typeof args.session === "string" ? matchSession(book.trades, args.session) : null;
  const session = book.sessions.find((item) => item.id === id);
  if (!session) return { error: "No session matches that ref or name. Call list_sessions to see the refs." };
  // Walking candles past the replay cursor would show the trader prices they have not reached yet.
  if (session.state.status !== "finished") return { error: "This session is still being replayed. Level tests run on finished sessions only." };
  const stopPips = typeof args.stopLossPips === "number" && args.stopLossPips > 0 ? args.stopLossPips : null;
  const targetPips = typeof args.takeProfitPips === "number" && args.takeProfitPips > 0 ? args.takeProfitPips : null;
  if (!stopPips && !targetPips) return { error: "Give a stopLossPips or takeProfitPips to test." };

  const provider = getMarketDataProvider();
  const config = session.state.config;
  const results: { trade: ClosedTrade; pnl: number; outcome: string }[] = [];
  const bySymbol = new Map<string, ClosedTrade[]>();
  for (const trade of session.trades) {
    const symbol = recordSymbol(trade, config);
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), trade]);
  }
  for (const [symbol, trades] of bySymbol) {
    const candles = await provider.getCandles({ symbol, timeframe: config.timeframe, startTime: Math.min(...trades.map((trade) => trade.entryTime)), endTime: config.endTime }).catch(() => []);
    if (!candles.length) continue;
    const instrument = configForSymbol(config, symbol);
    const planConfig: PlanConfig = { spreadPips: instrument.spreadPips, pipSize: instrument.pipSize, quoteCurrency: instrument.quoteCurrency, accountCurrency: instrument.accountCurrency, baseCurrency: instrument.baseCurrency, symbol, executionPolicy: config.executionPolicy };
    for (const trade of trades) {
      const entry = new Decimal(trade.entryPrice);
      const away = (pips: number, favourable: boolean) => {
        const distance = new Decimal(pips).times(instrument.pipSize);
        return (trade.direction === "long") === favourable ? entry.plus(distance).toString() : entry.minus(distance).toString();
      };
      const stopLoss = stopPips ? away(stopPips, false) : trade.initialStopLoss ?? null;
      const takeProfit = targetPips ? away(targetPips, true) : trade.initialTakeProfit ?? null;
      if (!stopLoss && !takeProfit) continue;
      // A unit risk makes the plan's R equal to its P/L in account currency.
      const test = testTradePlan({ ...trade, initialStopLoss: stopLoss, initialTakeProfit: takeProfit, initialRiskAmount: "1" }, candles, planConfig);
      if (test) results.push({ trade, pnl: test.planR, outcome: test.outcome });
    }
  }
  if (!results.length) return { error: "None of this session's trades could be re-run (no stop or target to test, or no candles)." };

  // Results come back grouped by market; pair each with its trade, not its position.
  const byTrade = new Map(results.map((result) => [result.trade, result]));
  const paired = book.trades
    .filter((trade) => trade.sessionId === session.id)
    .flatMap((trade) => {
      const result = byTrade.get(session.trades[trade.number - 1]!);
      return result ? [{ trade, result }] : [];
    });
  const actual = paired.map(({ trade }) => trade);
  const simulated = paired.map(({ trade, result }) => ({ ...trade, pnl: Math.round(result.pnl * 100) / 100, r: null }));
  const changed = paired
    .map(({ trade, result }, index) => ({ cite: citation(trade), actual: trade.pnl, withNewLevels: simulated[index]!.pnl, outcome: result.outcome }))
    .filter((row) => Math.abs(row.actual - row.withNewLevels) >= 0.01)
    .sort((a, b) => Math.abs(b.withNewLevels - b.actual) - Math.abs(a.withNewLevels - a.actual))
    .slice(0, 15);
  return {
    session: session.name,
    tested: results.length,
    notTested: session.trades.length - results.length,
    levels: { stopLossPips: stopPips ?? "each trade's own", takeProfitPips: targetPips ?? "each trade's own" },
    actual: summarise(actual),
    withNewLevels: summarise(simulated),
    stillOpenAtDataEnd: results.filter((result) => result.outcome === "unresolved").length,
    biggestChanges: changed,
    note: "Trades are walked forward candle by candle from entry with the session's spread; a trade still open after 750 candles or at the session end is closed at the last price.",
  };
}

export async function runTool(name: string, args: Args, book: TradeBook): Promise<unknown> {
  switch (name) {
    case "list_sessions":
      return book.sessions.map((session) => {
        const own = book.trades.filter((trade) => trade.sessionId === session.id);
        const config = session.state.config;
        return {
          ref: session.ref,
          name: session.name,
          markets: (config.symbols?.length ? config.symbols : [config.symbol]).map(formatSymbol).join(", "),
          timeframe: config.timeframe,
          period: `${formatNewYorkDate(config.startTime)} to ${formatNewYorkDate(config.endTime)}`,
          status: session.state.status,
          ...summarise(own),
        };
      });
    case "find_trades": {
      const matches = filterTrades(book.trades, filterFrom(args));
      const sortBy = args.sortBy === "pnl" ? (trade: BookTrade) => trade.pnl : args.sortBy === "hold" ? holdMinutes : (trade: BookTrade) => trade.entryTime;
      const sorted = [...matches].sort((a, b) => (args.order === "desc" ? sortBy(b) - sortBy(a) : sortBy(a) - sortBy(b)));
      const limit = Math.min(MAX_LISTED_TRADES, typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 20);
      return { summary: summarise(matches), listed: sorted.slice(0, limit).map(tradeRow), more: Math.max(0, matches.length - limit) };
    }
    case "group_trades": {
      const by = GROUP_BY.includes(args.groupBy as GroupBy) ? (args.groupBy as GroupBy) : "symbol";
      return { groupBy: by, rows: groupTrades(filterTrades(book.trades, filterFrom(args)), by) };
    }
    case "what_if_skipped":
      return compareWithout(book.trades, filterFrom(args));
    case "what_if_levels":
      return whatIfLevels(book, args);
    default:
      return { error: `Unknown tool ${name}.` };
  }
}
