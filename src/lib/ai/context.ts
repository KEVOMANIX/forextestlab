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

/** A markdown fact-sheet across all of a user's saved (non-archived) sessions. */
export function buildPortfolioContext(sessions: BacktestSession[]): string {
  const rows = sessions
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
        symbols: symbols.map(formatSymbol).join(", "),
        timeframe: session.timeframe,
        status: session.status,
        period: `${formatNewYorkDate(Number(session.startTime), { day: "numeric", month: "short" })}–${formatNewYorkDate(Number(session.endTime), { day: "numeric", month: "short", year: "numeric" })}`,
        trades: trades.length,
        net: net.toNumber(),
        winRate: stats?.winRate ?? "Not available",
        profitFactor: stats?.profitFactor ?? "Not available",
        maxDd: stats?.maxDrawdown ?? "$0.00",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, 30);

  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const totalTrades = rows.reduce((s, r) => s + r.trades, 0);

  const lines: string[] = [];
  lines.push(`# Trader portfolio — ${rows.length} saved session(s)`);
  lines.push(`Combined realised net P/L across sessions: ${money(totalNet)} over ${totalTrades} trades.`);
  lines.push("\n## Sessions (newest first)");
  rows.forEach((r, i) => {
    lines.push(
      `${i + 1}. "${r.name}" — ${r.symbols} ${r.timeframe} (${r.period}), ${r.status}: ` +
        `${r.trades} trades, net ${money(r.net)}, win rate ${r.winRate}%, ` +
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
