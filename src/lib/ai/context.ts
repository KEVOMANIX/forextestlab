/**
 * Build compact, factual analytics summaries to ground the AI assistant.
 *
 * We never send raw trade blobs verbatim; instead we compute the same derived
 * metrics the analytics UI shows and serialise them as terse markdown. This
 * keeps the prompt small, deterministic, and free of hallucinated numbers.
 */

import "server-only";

import type { BacktestSession } from "@prisma/client";

import { computeStatistics } from "@/lib/backtest/statistics";
import type { ClosedTrade, SessionState } from "@/lib/backtest/types";
import { Decimal } from "@/lib/decimal";
import { formatNewYorkDate, getNewYorkDateParts, getTradingSession } from "@/lib/date-time";
import { formatSymbol } from "@/lib/market-data/symbols";
import type { SessionResults } from "@/lib/backtest/results";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function money(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function aggregate<T extends string | number>(
  trades: ClosedTrade[],
  keyFor: (trade: ClosedTrade) => T,
): Array<{ key: T; net: number; count: number; wins: number }> {
  const map = new Map<T, { net: number; count: number; wins: number }>();
  for (const trade of trades) {
    const key = keyFor(trade);
    const pnl = Number(trade.pnl);
    const entry = map.get(key) ?? { net: 0, count: 0, wins: 0 };
    entry.net += pnl;
    entry.count += 1;
    if (pnl > 0) entry.wins += 1;
    map.set(key, entry);
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v }));
}

/** A markdown fact-sheet for a single backtest session. */
export function buildSessionContext(results: SessionResults): string {
  const { state, stats } = results;
  const trades = state.closedTrades;
  const start = Number(state.config.startingBalance);
  const net = Number(state.balance) - start;
  const returnPct = start ? (net / start) * 100 : 0;

  const lines: string[] = [];
  lines.push(`# Session: ${results.name}`);
  lines.push(
    `Markets: ${results.symbols.map(formatSymbol).join(", ")} · Timeframe: ${results.timeframe} · ` +
      `Period: ${formatNewYorkDate(state.config.startTime)} to ${formatNewYorkDate(state.config.endTime)} (New York) · ` +
      `Status: ${state.status}`,
  );
  lines.push(
    `Execution: spread ${state.config.spreadPips} pips, commission $${state.config.commissionPerLot}/lot, ` +
      `slippage ${state.config.slippagePips} pips, policy ${state.config.executionPolicy}.`,
  );

  lines.push("\n## Headline performance");
  lines.push(`- Starting balance: ${money(start)}`);
  lines.push(`- Ending balance: ${money(Number(state.balance))}`);
  lines.push(`- Net P/L: ${money(net)} (${returnPct.toFixed(2)}% return)`);
  lines.push(`- Total trades: ${stats.totalTrades} (${stats.winningTrades} wins / ${stats.losingTrades} losses)`);
  lines.push(`- Win rate: ${stats.winRate}%`);
  lines.push(`- Profit factor: ${stats.profitFactor}`);
  lines.push(`- Expectancy per trade: ${stats.expectancy}`);
  lines.push(`- Average win: ${stats.averageWin} · Average loss: ${stats.averageLoss}`);
  lines.push(`- Largest win: ${stats.largestWin} · Largest loss: ${stats.largestLoss}`);
  lines.push(`- Max drawdown: ${stats.maxDrawdown} (${stats.maxDrawdownPercent}%)`);
  lines.push(`- Max consecutive wins: ${stats.maxConsecutiveWins} · losses: ${stats.maxConsecutiveLosses}`);
  lines.push(`- Average achieved risk/reward: ${stats.averageRiskReward}`);

  if (trades.length) {
    const longs = trades.filter((t) => t.direction === "long");
    const shorts = trades.filter((t) => t.direction === "short");
    const dirLine = (label: string, group: ClosedTrade[]) => {
      const gnet = group.reduce((s, t) => s + Number(t.pnl), 0);
      const wins = group.filter((t) => Number(t.pnl) > 0).length;
      const wr = group.length ? ((wins / group.length) * 100).toFixed(1) : "0.0";
      return `- ${label}: ${group.length} trades, net ${money(gnet)}, win rate ${wr}%`;
    };
    lines.push("\n## By direction");
    lines.push(dirLine("Buy (long)", longs));
    lines.push(dirLine("Sell (short)", shorts));

    lines.push("\n## Exit reasons");
    for (const row of aggregate(trades, (t) => t.exitReason).sort((a, b) => b.count - a.count)) {
      lines.push(`- ${row.key}: ${row.count} (${((row.count / trades.length) * 100).toFixed(0)}%), net ${money(row.net)}`);
    }

    lines.push("\n## Net P/L by weekday (New York entry)");
    for (const row of aggregate(trades, (t) => getNewYorkDateParts(t.entryTime).weekday).sort((a, b) => a.key - b.key)) {
      lines.push(`- ${WEEKDAYS[row.key]}: ${row.count} trades, net ${money(row.net)}`);
    }

    lines.push("\n## Net P/L by trading session (New York entry)");
    for (const row of aggregate(trades, (t) => getTradingSession(t.entryTime)).sort((a, b) => b.net - a.net)) {
      lines.push(`- ${row.key}: ${row.count} trades, net ${money(row.net)}`);
    }

    const sorted = [...trades].sort((a, b) => Number(b.pnl) - Number(a.pnl));
    lines.push("\n## Best trades");
    for (const t of sorted.slice(0, 3)) {
      lines.push(`- ${t.direction} ${money(Number(t.pnl))} (${t.pips} pips, exit ${t.exitReason})`);
    }
    lines.push("## Worst trades");
    for (const t of sorted.slice(-3).reverse()) {
      lines.push(`- ${t.direction} ${money(Number(t.pnl))} (${t.pips} pips, exit ${t.exitReason})`);
    }

    lines.push("\n## Most recent trades (up to 12, newest first)");
    for (const t of [...trades].sort((a, b) => b.exitTime - a.exitTime).slice(0, 12)) {
      lines.push(
        `- ${formatNewYorkDate(t.entryTime, { day: "numeric", month: "short" })} ${t.direction} ` +
          `${money(Number(t.pnl))} (${t.pips} pips, exit ${t.exitReason})`,
      );
    }
  }

  if (results.notes?.trim()) {
    lines.push(`\n## Trader's notes\n${results.notes.trim().slice(0, 800)}`);
  }

  return lines.join("\n");
}

interface PortfolioSession {
  name: string;
  symbol: string;
  symbols: string;
  timeframe: string;
  status: string;
  period: string;
  trades: ClosedTrade[];
  net: number;
  winRate: string;
  profitFactor: string;
  maxDd: string;
}

/**
 * A markdown fact-sheet across all of a user's saved (non-archived) sessions.
 * Includes the same drill-down breakdowns the per-session analytics show —
 * rolled up across sessions — so questions like "where am I losing the most"
 * can be answered by instrument, weekday, session window, and exit reason.
 */
export function buildPortfolioContext(sessions: BacktestSession[]): string {
  const parsed: PortfolioSession[] = sessions
    .map((session) => {
      let state: SessionState | null = null;
      try {
        state = JSON.parse(session.stateJson) as SessionState;
      } catch {
        return null;
      }
      if (state?.config.archived === true) return null;
      const trades = state?.closedTrades ?? [];
      const net = new Decimal(session.balance).minus(session.startingBalance);
      const stats = state
        ? computeStatistics({
            startingBalance: session.startingBalance,
            endingBalance: session.balance,
            trades,
            equityCurve: state.equityCurve,
          })
        : null;
      const symbols = state?.config.symbols?.length ? state.config.symbols : [session.symbol];
      return {
        name: state?.config.name?.trim() || `${session.symbol} backtest`,
        symbol: state?.config.symbol || session.symbol,
        symbols: symbols.map(formatSymbol).join(", "),
        timeframe: session.timeframe,
        status: session.status,
        period: `${formatNewYorkDate(Number(session.startTime), { day: "numeric", month: "short" })}–${formatNewYorkDate(Number(session.endTime), { day: "numeric", month: "short", year: "numeric" })}`,
        trades,
        net: net.toNumber(),
        winRate: stats?.winRate ?? "Not available",
        profitFactor: stats?.profitFactor ?? "Not available",
        maxDd: stats?.maxDrawdown ?? "$0.00",
      };
    })
    .filter((row): row is PortfolioSession => row !== null);

  // Roll up every trade across sessions. Trades are attributed to their
  // session's primary instrument (sessions are single-pair on the trial tier).
  const allTrades: ClosedTrade[] = [];
  const bySymbol = new Map<string, { net: number; count: number; wins: number }>();
  const tagged: Array<{ trade: ClosedTrade; symbol: string; session: string }> = [];
  for (const s of parsed) {
    const sym = formatSymbol(s.symbol);
    for (const t of s.trades) {
      allTrades.push(t);
      tagged.push({ trade: t, symbol: sym, session: s.name });
      const pnl = Number(t.pnl);
      const e = bySymbol.get(sym) ?? { net: 0, count: 0, wins: 0 };
      e.net += pnl;
      e.count += 1;
      if (pnl > 0) e.wins += 1;
      bySymbol.set(sym, e);
    }
  }

  const totalNet = parsed.reduce((s, r) => s + r.net, 0);
  const grossWin = allTrades.reduce((s, t) => s + Math.max(0, Number(t.pnl)), 0);
  const grossLoss = Math.abs(allTrades.reduce((s, t) => s + Math.min(0, Number(t.pnl)), 0));
  const wins = allTrades.filter((t) => Number(t.pnl) > 0).length;

  const lines: string[] = [];
  lines.push(`# Trader portfolio — ${parsed.length} saved session(s)`);
  lines.push("\n## Overall (all trades combined)");
  lines.push(`- Realised net P/L: ${money(totalNet)}`);
  lines.push(`- Total closed trades: ${allTrades.length} (${wins} wins / ${allTrades.length - wins} losses)`);
  lines.push(`- Win rate: ${allTrades.length ? ((wins / allTrades.length) * 100).toFixed(1) : "0.0"}%`);
  lines.push(`- Profit factor: ${grossLoss ? (grossWin / grossLoss).toFixed(2) : "n/a"}`);
  lines.push(`- Expectancy per trade: ${allTrades.length ? money(totalNet / allTrades.length) : "n/a"}`);
  lines.push(`- Gross profit: ${money(grossWin)} · Gross loss: ${money(-grossLoss)}`);

  if (allTrades.length) {
    lines.push("\n## Net P/L by instrument (worst first)");
    for (const [sym, v] of [...bySymbol.entries()].sort((a, b) => a[1].net - b[1].net)) {
      const wr = v.count ? ((v.wins / v.count) * 100).toFixed(0) : "0";
      lines.push(`- ${sym}: net ${money(v.net)} over ${v.count} trades, ${wr}% win rate`);
    }

    lines.push("\n## Net P/L by weekday (New York entry)");
    for (const row of aggregate(allTrades, (t) => getNewYorkDateParts(t.entryTime).weekday).sort((a, b) => a.key - b.key)) {
      lines.push(`- ${WEEKDAYS[row.key]}: ${money(row.net)} over ${row.count} trades`);
    }

    lines.push("\n## Net P/L by trading session (New York entry)");
    for (const row of aggregate(allTrades, (t) => getTradingSession(t.entryTime)).sort((a, b) => a.net - b.net)) {
      lines.push(`- ${row.key}: ${money(row.net)} over ${row.count} trades`);
    }

    lines.push("\n## Net P/L by exit reason");
    for (const row of aggregate(allTrades, (t) => t.exitReason).sort((a, b) => a.net - b.net)) {
      lines.push(`- ${row.key}: ${money(row.net)} over ${row.count} trades`);
    }

    lines.push("\n## By direction");
    for (const dir of ["long", "short"] as const) {
      const g = allTrades.filter((t) => t.direction === dir);
      const gnet = g.reduce((s, t) => s + Number(t.pnl), 0);
      const gw = g.filter((t) => Number(t.pnl) > 0).length;
      lines.push(`- ${dir === "long" ? "Buy" : "Sell"}: ${money(gnet)} over ${g.length} trades, ${g.length ? ((gw / g.length) * 100).toFixed(0) : "0"}% win rate`);
    }

    const worstTrades = [...tagged].sort((a, b) => Number(a.trade.pnl) - Number(b.trade.pnl)).slice(0, 5);
    lines.push("\n## Biggest losing trades (across all sessions)");
    for (const x of worstTrades) {
      lines.push(`- ${x.symbol} ${x.trade.direction} ${money(Number(x.trade.pnl))} (${x.trade.pips} pips, exit ${x.trade.exitReason}) in "${x.session}"`);
    }
  }

  const losers = [...parsed].filter((s) => s.net < 0).sort((a, b) => a.net - b.net).slice(0, 5);
  if (losers.length) {
    lines.push("\n## Worst sessions by net P/L");
    for (const s of losers) {
      lines.push(`- "${s.name}" (${s.symbols} ${s.timeframe}): net ${money(s.net)}, ${s.trades.length} trades, win rate ${s.winRate}%, max drawdown ${s.maxDd}`);
    }
  }

  lines.push("\n## All sessions (newest first)");
  parsed.slice(0, 30).forEach((r, i) => {
    lines.push(
      `${i + 1}. "${r.name}" — ${r.symbols} ${r.timeframe} (${r.period}), ${r.status}: ` +
        `${r.trades.length} trades, net ${money(r.net)}, win rate ${r.winRate}%, ` +
        `profit factor ${r.profitFactor}, max drawdown ${r.maxDd}.`,
    );
  });

  return lines.join("\n");
}

export const SESSION_SUGGESTED_QUESTIONS = [
  "What are the biggest weaknesses in this strategy?",
  "When during the week and day am I most profitable?",
  "Is my risk management consistent across trades?",
  "What one change would most improve my results?",
] as const;

export const PORTFOLIO_SUGGESTED_QUESTIONS = [
  "Which of my strategies is performing best, and why?",
  "What patterns show up across all my sessions?",
  "Where am I losing the most money overall?",
  "What should I focus on to improve as a trader?",
] as const;
