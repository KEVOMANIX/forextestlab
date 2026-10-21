import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { aggregatesFromPnls, describePerformance } from "@/lib/backtest/practice-performance";

import { SignedInDashboard, type DashboardPracticeMetrics, type DashboardSession } from "./SignedInDashboard";

const metrics: DashboardPracticeMetrics = {
  practiceMinutes: 103,
  practiceMinutesByDay: [0, 0, 103, 0, 0, 0, 0],
  weekStart: "2026-10-19",
  currentWeekdayIndex: 2,
  streakDays: 1,
  closedTradesThisWeek: 3,
};

function results(pnls: Array<string | number>) {
  return describePerformance("all", aggregatesFromPnls(pnls)!);
}

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

  it("names the results plainly and says each figure once", () => {
    const pnls = Array.from({ length: 24 }, (_, index) => (index % 3 === 0 ? "-10" : "25"));
    const html = renderToStaticMarkup(createElement(SignedInDashboard, { sessions: [session({})], displayName: "Kelvin", metrics, performance: results(pnls) }));
    expect(html).toContain("Your practice results");
    expect(html).toContain("24 trades · challenges not included");
    expect(html).toContain("Avg per trade");
    expect(html).not.toContain("Expectancy");
    expect(html).toContain("Cumulative P/L");
    expect(html).toContain("Max drawdown");
    // Net P/L (16 wins of 25, 8 losses of 10) is shown once, in the figures, not
    // again in the chart header. (The chart's screen-reader label may name it.)
    expect(html.match(/>\+\$320\.00</g)).toHaveLength(1);
    expect(html).not.toContain("Bar height = trade P/L");
    expect(html).not.toContain("Last 30 trades");
  });

  it("anchors the drawdown marker to the plot, behind an opacity-only fade", () => {
    const html = renderToStaticMarkup(createElement(SignedInDashboard, { sessions: [session({})], displayName: "Kelvin", metrics, performance: results(["50", "-20", "-40", "30"]) }));
    // A transform-based animation on the marker's wrapper would become its
    // containing block and push the dot below the chart.
    expect(html).toMatch(/<div class="animate-fade-in motion-reduce:animate-none"[^>]*><span aria-hidden="true" class="absolute h-2\.5/);
  });

  it("compares the win rate with the break-even its win and loss sizes imply", () => {
    // Wins of 75 against losses of 15: break-even at 17%, winning 33%.
    const html = renderToStaticMarkup(createElement(SignedInDashboard, { sessions: [session({})], displayName: "Kelvin", metrics, performance: results(["-10", "-20", "75"]) }));
    expect(html).toContain("17 points above");
    expect(html).toContain("17%</strong> break-even");
    expect(html).toContain("3 trades · early days, these settle after about 30");
  });

  it("offers 30 days, 90 days and all time, marking the current period", () => {
    const html = renderToStaticMarkup(createElement(SignedInDashboard, { sessions: [session({})], displayName: "Kelvin", metrics, performance: results(["5"]), period: "90d" }));
    expect(html).toContain('href="/app?period=30d"');
    expect(html).toMatch(/<a aria-current="true"[^>]*href="\/app\?period=90d"/);
    expect(html).toContain("All time");
  });

  it("explains an empty period and still shows this week", () => {
    const html = renderToStaticMarkup(createElement(SignedInDashboard, { sessions: [session({})], displayName: "Kelvin", metrics, performance: null, period: "30d" }));
    expect(html).toContain("No practice trades in the last 30 days");
    expect(html).not.toContain("Cumulative P/L");
    expect(html).toContain("Practice trades");
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
