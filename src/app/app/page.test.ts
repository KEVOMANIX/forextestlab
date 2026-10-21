import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findMany: vi.fn(), metadata: vi.fn(), activity: vi.fn(), tradeCount: vi.fn() }));
const dashboard = vi.hoisted(() => vi.fn(() => null));
const performance = vi.hoisted(() => vi.fn(async () => ({ tradeCount: 3, netPnl: "7.00" })));
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("@/lib/db", () => ({ prisma: { backtestSession: db, productEvent: { findMany: db.activity }, simulatedTrade: { count: db.tradeCount }, $queryRaw: db.metadata } }));
vi.mock("@/lib/auth", () => ({ ensureUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => ({ id: "owner", email: "owner@example.com", user_metadata: {} }) }));
vi.mock("@/components/app/SignedInDashboard", () => ({ SignedInDashboard: dashboard }));
vi.mock("@/lib/backtest/challenge-queries", () => ({ loadActiveChallengeCard: vi.fn(async () => null) }));
vi.mock("@/lib/backtest/practice-performance-query", () => ({ loadPracticePerformance: performance }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieJar.value ? { value: cookieJar.value } : undefined) }) }));

import AppHome from "./page";

function arrange() {
  db.findMany.mockResolvedValue([{ id: "session", symbol: "EURUSD", timeframe: "1h", startTime: BigInt(1), endTime: BigInt(2), status: "paused", visibleIndex: 0, visibleTime: null, totalCandles: 1, startingBalance: "10000", depositedFunds: "0", balance: "10025", maxDrawdown: "0", maxDrawdownPercent: "0", updatedAt: new Date() }]);
  db.metadata
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ sessionId: "session", closedTrades: BigInt(4), winningTrades: BigInt(3) }]);
  db.activity.mockResolvedValue([
    { createdAt: new Date() },
    { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
  ]);
  db.tradeCount.mockResolvedValue(2);
}

describe("dashboard practice overview", () => {
  beforeEach(() => {
    cookieJar.value = undefined;
    performance.mockClear();
  });

  it("passes session-library and practice metrics without loading an individual session snapshot", async () => {
    arrange();
    const page = await AppHome();

    expect(page.props).toEqual(expect.objectContaining({
      sessions: [expect.objectContaining({ id: "session", name: "EURUSD backtest", sessionWinRate: { closedTrades: 4, winRate: 75 } })],
      metrics: expect.objectContaining({
        practiceMinutes: 1,
        closedTradesThisWeek: 2,
        weekStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      performance: { tradeCount: 3, netPnl: "7.00" },
      period: "all",
    }));
    expect(performance).toHaveBeenCalledWith("owner", "all");
    expect(db.activity).toHaveBeenCalledOnce();
    // Challenges have their own page; the dashboard's sessions and trade
    // statistics are practice only.
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ challengeStatus: null }),
    }));
    expect(db.tradeCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ session: expect.objectContaining({ challengeStatus: null }), validity: { not: "experimental" } }),
    }));
    expect(db.metadata).toHaveBeenCalledTimes(2);
  });

  it("takes the period from the link, then the remembered choice", async () => {
    arrange();
    await AppHome({ searchParams: Promise.resolve({ period: "30d" }) });
    expect(performance).toHaveBeenLastCalledWith("owner", "30d");

    arrange();
    cookieJar.value = "90d";
    const page = await AppHome({ searchParams: Promise.resolve({}) });
    expect(performance).toHaveBeenLastCalledWith("owner", "90d");
    expect(page.props.period).toBe("90d");

    arrange();
    await AppHome({ searchParams: Promise.resolve({ period: "nonsense" }) });
    expect(performance).toHaveBeenLastCalledWith("owner", "90d");
  });
});
