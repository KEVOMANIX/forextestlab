import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ChallengeAttempt, ChallengesOverview } from "@/lib/backtest/challenge-queries";
import { summarizeChallenges } from "@/lib/backtest/challenge-record";

import { ChallengesView } from "./ChallengesView";

function attempt(overrides: Partial<ChallengeAttempt>): ChallengeAttempt {
  return {
    id: "jun", name: "GBP/USD · Jun 2024", pairs: ["GBP/USD"], symbol: "GBPUSD", dateRange: "3 Jun – 28 Jun 2024",
    phase: 1, accountSize: "10000", accountLabel: "$10K", targetPercent: 10, result: "in-progress", breach: null,
    profitPercent: 4.362, tradingDays: 6, ...overrides,
  };
}

function overview(attempts: ChallengeAttempt[], running = false): ChallengesOverview {
  return {
    active: running ? {
      id: "jun", name: "GBP/USD · Jun 2024", phase: 1, accountLabel: "$10K", dayLabel: "Day 10 of 30",
      equity: "10436.20", profit: "436.20", profitPercent: 4.362, targetPercent: 10, targetEquity: "11000.00",
      targetProgress: 0.4362, toTarget: "563.80", dailyPercent: 5, dailyAllowance: "500.00", dailyRemaining: "379.60",
      dailyUsedRatio: 0.2408, totalPercent: 10, totalFloor: "9000.00", totalRemaining: "1436.20", totalUsedRatio: 0,
      tradingDays: 6, resetZone: "Europe/Prague",
    } : null,
    days: running ? [
      { key: "2024-06-07", label: "Fri 7", pnl: "197.00", today: false },
      { key: "2024-06-10", label: "Today", pnl: "-120.40", today: true },
    ] : [],
    attempts,
    summary: summarizeChallenges(attempts),
  };
}

function render(value: ChallengesOverview): string {
  return renderToStaticMarkup(createElement(ChallengesView, { overview: value }));
}

describe("ChallengesView", () => {
  it("shows a running challenge as three gauges and its daily P/L against the limit", () => {
    const html = render(overview([attempt({}), attempt({ id: "nov", name: "XAU/USD · Nov 2023", result: "failed", breach: "daily-loss" })], true));
    expect(html).toContain("43.6%");
    expect(html).toContain("$379.60");
    expect(html).toContain("$1,436");
    expect(html).toContain('href="/app/backtest?session=jun"');
    expect(html).toContain("Limit −$500.00");
    expect(html).toContain("−120.40");
    expect(html).not.toContain("Start Phase 2");
  });

  it("offers Phase 2 on the same market and size once Phase 1 has passed", () => {
    const html = render(overview([attempt({ result: "passed", profitPercent: 12.9, tradingDays: 20 })]));
    expect(html).toContain("Phase 1 passed");
    expect(html).toContain("Start Phase 2");
    expect(html).toContain('href="/app/backtest?mode=challenge&amp;phase=2&amp;market=GBPUSD&amp;size=10000"');
    expect(html).toContain('aria-label="Challenge phases"');
  });

  it("offers another try, with the same settings, after a failed attempt", () => {
    const html = render(overview([attempt({ result: "failed", breach: "daily-loss", tradingDays: 4 })]));
    expect(html).toContain("Failed · Daily loss");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/app/backtest?mode=challenge&amp;market=GBPUSD&amp;size=10000"');
  });

  it("keeps one start button and a compact record without empty figures", () => {
    const html = render(overview([attempt({ result: "passed", profitPercent: 12.9, tradingDays: 20 })]));
    expect(html.match(/Start a challenge/g)).toHaveLength(1);
    expect(html).toContain("Phase 1 pass time");
    expect(html).toContain("20 days");
    expect(html).not.toContain("Top failure");
    expect(html).not.toContain("No challenge running");
    expect(html).toContain("+12.90%");
    expect(html).toContain("/ 10%");
    expect(html).toContain("3 Jun – 28 Jun 2024");
  });

  it("explains challenges when there are none yet", () => {
    const html = render(overview([]));
    expect(html).toContain("No challenges yet");
    expect(html).not.toContain("All attempts");
  });
});
