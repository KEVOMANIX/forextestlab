import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { SignedInDashboard, type DashboardPracticeMetrics, type DashboardSession } from "./SignedInDashboard";

const metrics: DashboardPracticeMetrics = {
  practiceMinutes: 103,
  practiceMinutesByDay: [0, 0, 103, 0, 0, 0, 0],
  weekStart: "2026-10-19",
  currentWeekdayIndex: 2,
  streakDays: 1,
  closedTradesThisWeek: 3,
  winRate: (2 / 3) * 100,
  winRateSampleSize: 3,
  winningTrades: 2,
  losingTrades: 1,
  recentTradePnls: [2, -5, 10],
  recentNetPnl: "7.00",
  recentProfitFactor: 2.4,
};

function session(overrides: Partial<DashboardSession>): DashboardSession {
  return {
    id: "active",
    symbol: "EURUSD",
    symbols: ["EURUSD"],
    name: "EUR/USD · Dec 2025",
    timeframe: "1m",
    startTime: BigInt(Date.parse("2025-12-01T12:00:00Z")),
    endTime: BigInt(Date.parse("2025-12-31T12:00:00Z")),
    status: "paused",
    visibleIndex: 100,
    visibleTime: BigInt(Date.parse("2025-12-10T15:00:00Z")),
    totalCandles: 1500,
    startingBalance: "10000",
    depositedFunds: "0",
    balance: "10704.55",
    maxDrawdown: "0",
    maxDrawdownPercent: "0",
    updatedAt: new Date(),
    archived: false,
    sessionWinRate: { closedTrades: 25, winRate: 48 },
    ...overrides,
  };
}

const unplayed = session({
  id: "unplayed",
  name: "EUR/USD · May 2003",
  status: "idle",
  balance: "10000",
  sessionWinRate: { closedTrades: 0, winRate: null },
  updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60_000),
});

function render(sessions: DashboardSession[]): string {
  return renderToStaticMarkup(createElement(SignedInDashboard, { sessions, displayName: "Kelvin", metrics }));
}

describe("SignedInDashboard", () => {
  it("names the session the main button continues, with its replay day", () => {
    const html = render([session({}), unplayed]);
    expect(html).toContain("Continue EUR/USD · Dec 2025");
    expect(html).toContain("Day 10 of 31");
  });

  it("offers Start, not Resume, for a session that has never been played", () => {
    const html = render([unplayed]);
    expect(html).toContain("Start EUR/USD · May 2003");
    expect(html).toContain("Not started");
    expect(html).toMatch(/<\/svg>\s*Start<\/a>/);
    expect(html).not.toMatch(/<\/svg>\s*Resume<\/a>/);
  });

  it("shows a zero result as a neutral $0.00, never a green +$0.00", () => {
    const html = render([unplayed]);
    expect(html).not.toContain("+$0.00");
    expect(html).toMatch(/app-muted">\$0\.00</);
    expect(html).not.toMatch(/text-profit">\$0\.00</);
  });

  it("reports recent net P/L and profit factor alongside the win rate", () => {
    const html = render([session({})]);
    expect(html).toContain("+$7.00");
    expect(html).toContain("2.40");
    expect(html).toContain("Bar height = trade P/L");
  });

  it("labels the week and lists each session's trade count without brand-coloured win rates", () => {
    const html = render([session({})]);
    expect(html).toContain("19–25 Oct");
    expect(html).toContain("25 trades");
    expect(html).not.toContain('text-brand-300">48%');
  });
});
