import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { practicePerformance } from "@/lib/backtest/practice-performance";

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

  it("leads with net P/L, expectancy, profit factor and drawdown beside the win rate", () => {
    const html = renderToStaticMarkup(createElement(SignedInDashboard, {
      sessions: [session({})],
      displayName: "Kelvin",
      metrics,
      performance: practicePerformance(["2", "-5", "10"]),
    }));
    expect(html).toContain("Last 3 practice trades");
    expect(html).toContain("+$7.00");
    expect(html).toContain("+$2.33");
    expect(html).toContain("2.40");
    expect(html).toContain("Cumulative P/L");
    expect(html).toContain("Max drawdown");
    expect(html).toContain("Bar height = trade P/L");
  });

  it("leaves the Performance section out before the first practice trade", () => {
    expect(render([session({})])).not.toContain("Cumulative P/L");
  });

  it("shows a running challenge as a strip that links to the Challenges page", () => {
    const html = renderToStaticMarkup(createElement(SignedInDashboard, {
      sessions: [session({})],
      displayName: "Kelvin",
      metrics,
      activeChallenge: {
        id: "jun", name: "GBP/USD · Jun 2024", phase: 1, accountLabel: "$10K", dayLabel: "Day 10 of 30",
        equity: "10436.20", profit: "436.20", profitPercent: 4.362, targetPercent: 10, targetEquity: "11000.00",
        targetProgress: 0.4362, toTarget: "563.80", dailyPercent: 5, dailyAllowance: "500.00", dailyRemaining: "379.60",
        dailyUsedRatio: 0.2408, totalPercent: 10, totalFloor: "9000.00", totalRemaining: "1436.20", totalUsedRatio: 0,
        tradingDays: 6, resetZone: "Europe/Prague",
      },
    }));
    expect(html).toContain("Challenge · Phase 1");
    expect(html).toContain("43.6%");
    expect(html).toContain("$379.60");
    expect(html).toContain('href="/app/challenges"');
  });

  it("shows no challenge strip when no challenge is running", () => {
    expect(render([session({})])).not.toContain("Challenge · Phase");
  });

  it("labels the week and lists each session's trade count without brand-coloured win rates", () => {
    const html = render([session({})]);
    expect(html).toContain("19–25 Oct");
    expect(html).toContain("25 trades");
    expect(html).not.toContain('text-brand-300">48%');
  });
});
