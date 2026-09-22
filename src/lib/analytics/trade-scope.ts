import type { ClosedTrade } from "@/lib/backtest/types";

/**
 * Experimental trades remain in the journal for review, but do not contribute
 * to strategy performance. Older trades without a journal remain included.
 */
export function isAnalyticsTrade(trade: ClosedTrade): boolean {
  return trade.journal?.validity !== "experimental";
}

export function analyticsTrades(trades: ClosedTrade[]): ClosedTrade[] {
  return trades.filter(isAnalyticsTrade);
}
