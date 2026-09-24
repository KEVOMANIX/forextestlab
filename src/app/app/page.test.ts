import { describe, expect, it, vi } from "vitest";
import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import { computeStatistics } from "@/lib/backtest/statistics";

const db = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), metadata: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { backtestSession: db, $queryRaw: db.metadata } }));
vi.mock("@/lib/auth", () => ({ ensureUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => ({ id: "owner", email: "owner@example.com", user_metadata: {} }) }));
vi.mock("@/lib/billing/entitlements", () => ({ getUserEntitlements: async () => ({ fullAnalytics: true }) }));
vi.mock("@/lib/backtest/state-snapshot-store", () => ({ readSessionSnapshot: db.snapshot }));
vi.mock("@/components/app/SignedInDashboard", () => ({ SignedInDashboard: () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import AppHome from "./page";

describe("dashboard snapshot consistency", () => {
  it("uses the saved replay trades and equity even when projections have the same count but different results", async () => {
    const trades = [...Array(6).fill("200"), ...Array(6).fill("-100"), "-111.50"].map((pnl, index) => ({
      id: String(index), pnl, entryPrice: "1.1", exitPrice: "1.2", stopLoss: null, takeProfit: null,
      direction: "long", lots: "1", entryTime: index, exitTime: index + 1, pips: "0",
    })) as ClosedTrade[];
    const equity: EquityPoint[] = [
      { index: 0, time: 1, balance: "10000", equity: "10000" },
      { index: 1, time: 2, balance: "11000", equity: "11790" },
      { index: 2, time: 3, balance: "10488.50", equity: "10488.50" },
    ];
    db.findMany.mockResolvedValue([{ id: "session", symbol: "EURUSD", startingBalance: "10000", depositedFunds: "0", balance: "9999" }]);
    db.metadata.mockResolvedValue([]);
    db.findFirst.mockResolvedValue({ stateJson: "metadata", stateObjectKey: "snapshot", trades: trades.map((t) => ({ ...t, pnl: "-10" })), equitySnapshots: [] });
    db.snapshot.mockResolvedValue(JSON.stringify({ config: { startingBalance: "10000", symbol: "EURUSD" }, balance: "10488.50", closedTrades: trades, equityCurve: equity }));

    const page = await AppHome({});
    const props = page.props;
    expect(props.selectedTrades.map((t: ClosedTrade) => t.pnl)).toEqual(trades.map((t) => t.pnl));
    expect(props.selectedEquityCurve).toEqual(equity);
    expect(props.sessions[0].balance).toBe("10488.50");
    const stats = computeStatistics({ startingBalance: props.sessions[0].startingBalance, endingBalance: props.sessions[0].balance, trades: props.selectedTrades, equityCurve: props.selectedEquityCurve });
    expect(stats.winRate).toBe("46.2");
    expect(stats.expectancy).toBe("37.58");
    expect(stats.maxDrawdown).toBe("1301.50");
    expect(db.snapshot).toHaveBeenCalledWith("metadata", "snapshot");
  });
});
