import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findMany: vi.fn(), metadata: vi.fn(), activity: vi.fn(), trades: vi.fn(), tradeCount: vi.fn() }));
const dashboard = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/db", () => ({ prisma: { backtestSession: db, productEvent: { findMany: db.activity }, simulatedTrade: { findMany: db.trades, count: db.tradeCount }, $queryRaw: db.metadata } }));
vi.mock("@/lib/auth", () => ({ ensureUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => ({ id: "owner", email: "owner@example.com", user_metadata: {} }) }));
vi.mock("@/components/app/SignedInDashboard", () => ({ SignedInDashboard: dashboard }));

import AppHome from "./page";

describe("dashboard practice overview", () => {
  it("passes session-library and practice metrics without loading an individual session snapshot", async () => {
    db.findMany.mockResolvedValue([{ id: "session", symbol: "EURUSD", timeframe: "1h", startTime: BigInt(1), endTime: BigInt(2), status: "paused", visibleIndex: 0, visibleTime: null, totalCandles: 1, startingBalance: "10000", depositedFunds: "0", balance: "10025", maxDrawdown: "0", maxDrawdownPercent: "0", updatedAt: new Date() }]);
    db.metadata
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ sessionId: "session", closedTrades: BigInt(4), winningTrades: BigInt(3) }]);
    db.activity.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
    ]);
    db.trades.mockResolvedValue([{ pnl: "10" }, { pnl: "-5" }, { pnl: "2" }]);
    db.tradeCount.mockResolvedValue(2);

    const page = await AppHome();

    expect(page.props).toEqual(expect.objectContaining({
      sessions: [expect.objectContaining({ id: "session", name: "EURUSD backtest", sessionWinRate: { closedTrades: 4, winRate: 75 } })],
      metrics: expect.objectContaining({ practiceMinutes: 1, closedTradesThisWeek: 2, winRate: (2 / 3) * 100, winRateSampleSize: 3 }),
    }));
    expect(db.activity).toHaveBeenCalledOnce();
    expect(db.trades).toHaveBeenCalledOnce();
    expect(db.metadata).toHaveBeenCalledTimes(2);
  });
});
