import { expect, it } from "vitest";
import { createShareSnapshot } from "./share-snapshot";
import { DEMO_ANALYTICS_TRADES, DEMO_ANALYTICS_EQUITY_CURVE } from "./demo-data";
import type { SessionState } from "@/lib/backtest/types";

const state = {
  config: { symbol: "EURUSD", name: "private-name", accountCurrency: "USD", startTime: 1, endTime: 2 },
  balance: "105000", equityCurve: DEMO_ANALYTICS_EQUITY_CURVE,
  closedTrades: DEMO_ANALYTICS_TRADES.map(t => ({ ...t, journal: { ...t.journal!, validity: "valid" }, id: "private-id", journalId: "private-journal", notes: "private-note" })),
} as SessionState;

it("shares performance without private identifiers, journal or notes", () => {
  const snapshot = createShareSnapshot(state, "100000");
  expect(snapshot.trades).toHaveLength(state.closedTrades.length);
  expect(JSON.stringify(snapshot)).not.toContain("private-");
  expect(snapshot.trades.every(t => !("journal" in t) && !("notes" in t))).toBe(true);
  expect(snapshot.equityCurve).toEqual(state.equityCurve);
  expect(snapshot.endingBalance).toBe(state.balance);
});

it("removes experimental trades and their effects on equity and balances", () => {
  const trade = state.closedTrades[0]!;
  const input = { ...state, closedTrades: [{ ...trade, pnl: "20", journal: undefined }, { ...trade, pnl: "99999", journal: { ...trade.journal!, validity: "experimental" as const } }] };
  const snapshot = createShareSnapshot(input, "100000");
  expect(snapshot.trades).toHaveLength(1);
  expect(snapshot.endingBalance).toBe("100020.00");
  expect(snapshot.equityCurve).toEqual([]);
  expect(input.closedTrades).toHaveLength(2);
});
