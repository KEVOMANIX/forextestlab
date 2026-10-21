import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ChallengesOverview } from "@/lib/backtest/challenge-queries";

import { ChallengesView } from "./ChallengesView";

const overview: ChallengesOverview = {
  active: {
    id: "jun", name: "GBP/USD · Jun 2024", phase: 1, accountLabel: "$10K", dayLabel: "Day 10 of 30",
    equity: "10436.20", profit: "436.20", profitPercent: 4.362, targetPercent: 10, targetEquity: "11000.00",
    targetProgress: 0.4362, toTarget: "563.80", dailyPercent: 5, dailyAllowance: "500.00", dailyRemaining: "379.60",
    dailyUsedRatio: 0.2408, totalPercent: 10, totalFloor: "9000.00", totalRemaining: "1436.20", totalUsedRatio: 0,
    tradingDays: 6, resetZone: "Europe/Prague",
  },
  days: [
    { key: "2024-06-07", label: "Fri 7", pnl: "197.00", today: false },
    { key: "2024-06-10", label: "Today", pnl: "-120.40", today: true },
  ],
  attempts: [
    { id: "jun", name: "GBP/USD · Jun 2024", pairs: ["GBP/USD"], phase: 1, accountLabel: "$10K", result: "in-progress", breach: null, profitPercent: 4.362, tradingDays: 6 },
    { id: "nov", name: "XAU/USD · Nov 2023", pairs: ["XAU/USD"], phase: 1, accountLabel: "$25K", result: "failed", breach: "daily-loss", profitPercent: -5.02, tradingDays: 4 },
  ],
  summary: { attempts: 2, inProgress: 1, passed: 0, failed: 1, passRate: 0, daysToPass: { 1: null, 2: null }, topFailure: { rule: "daily-loss", count: 1 } },
};

function render(value: ChallengesOverview): string {
  return renderToStaticMarkup(createElement(ChallengesView, { overview: value }));
}

describe("ChallengesView", () => {
  it("shows the running challenge as three gauges with continue and analytics links", () => {
    const html = render(overview);
    expect(html).toContain("43.6%");
    expect(html).toContain("$379.60");
    expect(html).toContain("$1,436");
    expect(html).toContain("Daily loss room");
    expect(html).toContain('href="/app/backtest?session=jun"');
    expect(html).toContain('href="/app/analytics?session=jun"');
  });

  it("charts daily P/L against the limit and lists every attempt with its result", () => {
    const html = render(overview);
    expect(html).toContain("Limit −$500.00");
    expect(html).toContain("−120.40");
    expect(html).toContain("In progress");
    expect(html).toContain("Failed");
    expect(html).toContain("Daily loss");
  });

  it("opens the challenge setup from the start button", () => {
    expect(render(overview)).toContain('href="/app/backtest?mode=challenge"');
  });

  it("explains challenges when there are none yet", () => {
    const html = render({ ...overview, active: null, days: [], attempts: [], summary: { ...overview.summary, attempts: 0 } });
    expect(html).toContain("No challenges yet");
    expect(html).not.toContain("All attempts");
  });
});
