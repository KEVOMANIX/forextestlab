/**
 * The finding cards at the top of the AI Analyst page: where the trader leaks
 * money, what is working, and how wins compare with losses. Computed from the
 * trades directly, so they cost nothing and never invent a number; "Discuss"
 * hands each one to the AI as a question.
 */

import { getNewYorkDateParts, getTradingSession } from "@/lib/date-time";

export interface FindingTrade {
  /** Already formatted for display, e.g. "EUR/USD". */
  symbol: string;
  pnl: number;
  entryTime: number;
}

export interface Finding {
  kind: "leak" | "strength" | "habit";
  title: string;
  text: string;
  question: string;
}

/** Below this, a group is noise rather than a pattern. */
const MIN_GROUP_TRADES = 3;
const MIN_TRADES = 5;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

interface Group {
  label: string;
  net: number;
  count: number;
  wins: number;
}

function money(value: number): string {
  return `$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function groups(trades: FindingTrade[]): Group[] {
  const map = new Map<string, Group>();
  const add = (label: string, pnl: number) => {
    const group = map.get(label) ?? { label, net: 0, count: 0, wins: 0 };
    group.net += pnl;
    group.count += 1;
    if (pnl > 0) group.wins += 1;
    map.set(label, group);
  };
  for (const trade of trades) {
    add(`${trade.symbol} trades`, trade.pnl);
    add(`${WEEKDAYS[getNewYorkDateParts(trade.entryTime).weekday]} trades`, trade.pnl);
    add(`${getTradingSession(trade.entryTime)} session trades`, trade.pnl);
  }
  return [...map.values()].filter((group) => group.count >= MIN_GROUP_TRADES);
}

export function buildFindings(trades: FindingTrade[]): Finding[] {
  if (trades.length < MIN_TRADES) return [];
  const findings: Finding[] = [];
  const all = groups(trades);

  const leak = all.filter((group) => group.net < 0).sort((a, b) => a.net - b.net)[0];
  if (leak) {
    findings.push({
      kind: "leak",
      title: `${leak.label} cost you ${money(leak.net)}`,
      text: `${leak.count} trades, ${leak.wins} won.`,
      question: `Why do my ${leak.label} lose money, and what should I change?`,
    });
  }

  const strength = all.filter((group) => group.net > 0).sort((a, b) => b.net - a.net)[0];
  if (strength) {
    findings.push({
      kind: "strength",
      title: `${strength.label} are working`,
      text: `+${money(strength.net)} over ${strength.count} trades, ${Math.round((strength.wins / strength.count) * 100)}% won.`,
      question: `What makes my ${strength.label} work, and how do I do more of it?`,
    });
  }

  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  if (wins.length && losses.length) {
    const avgWin = wins.reduce((sum, trade) => sum + trade.pnl, 0) / wins.length;
    const avgLoss = -losses.reduce((sum, trade) => sum + trade.pnl, 0) / losses.length;
    const detail = `Average win ${money(avgWin)}, average loss ${money(avgLoss)}.`;
    findings.push(avgWin < avgLoss
      ? { kind: "habit", title: "Your losses outweigh your wins", text: detail, question: "Why are my average losses bigger than my average wins, and how do I fix it?" }
      : { kind: "habit", title: "Your winners pay for your losers", text: detail, question: "How do I keep my winners bigger than my losers?" });
  }

  return findings;
}
