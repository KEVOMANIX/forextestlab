import { describe, expect, it } from "vitest";

import {
  accountSizeLabel,
  challengeCard,
  challengeColumns,
  challengeProgress,
  challengeResult,
  formatUsd,
  parseChallengeRules,
  summarizeChallenges,
  type ChallengeRow,
} from "./challenge-record";
import { PROP_FIRM_PRESETS } from "./prop-firm";
import type { SessionState } from "./types";

const rules = PROP_FIRM_PRESETS["ftmo-phase-1"];
// 10 June 2024, 14:00 in Prague.
const tenthOfJune = BigInt(Date.parse("2024-06-10T12:00:00Z"));

const row: ChallengeRow = {
  startingBalance: "10000",
  equity: "10436.20",
  maxEquity: "10556.60",
  visibleTime: tenthOfJune,
  challengeStatus: "active",
  challengeDayKey: "2024-06-10",
  challengeDayStartEquity: "10556.60",
  challengeTradingDays: 6,
};

describe("challengeColumns", () => {
  it("leaves every column null on an ordinary backtest", () => {
    const state = { config: {}, propFirm: undefined } as unknown as SessionState;
    expect(challengeColumns(state)).toEqual({
      challengeStatus: null,
      challengeBreach: null,
      challengeDayKey: null,
      challengeDayStartEquity: null,
      challengeTradingDays: null,
    });
  });

  it("mirrors the runtime of a challenge, including the rule it broke", () => {
    const state = {
      config: { propFirm: rules },
      propFirm: {
        status: "breached",
        breach: { rule: "daily-loss", at: 1, equity: "9400.00", limit: "9500.00" },
        dayKey: "2024-06-04",
        dayStartEquity: "10000.00",
        tradingDays: ["2024-06-03", "2024-06-04"],
      },
    } as unknown as SessionState;
    expect(challengeColumns(state)).toEqual({
      challengeStatus: "breached",
      challengeBreach: "daily-loss",
      challengeDayKey: "2024-06-04",
      challengeDayStartEquity: "10000.00",
      challengeTradingDays: 2,
    });
  });
});

describe("challengeProgress", () => {
  it("measures the target and both loss allowances from the row alone", () => {
    const progress = challengeProgress(row, rules);
    expect(progress.targetProgress).toBeCloseTo(0.4362, 4);
    expect(progress.dailyRemaining).toBe("379.60");
    expect(progress.totalRemaining).toBe("1436.20");
    expect(progress.tradingDays).toBe(6);
  });

  it("starts a new firm day at the current equity when only the cursor moved", () => {
    const nextDay = { ...row, visibleTime: BigInt(Date.parse("2024-06-11T12:00:00Z")) };
    expect(challengeProgress(nextDay, rules).dailyRemaining).toBe("500.00");
    expect(challengeProgress(nextDay, rules).dailyUsedRatio).toBe(0);
  });
});

describe("challengeCard", () => {
  it("collects what the gauges and the dashboard strip show", () => {
    const card = challengeCard({ id: "jun", name: "GBP/USD · Jun 2024", dayLabel: "Day 10 of 30", row, rules });
    expect(card).toEqual(expect.objectContaining({
      phase: 1,
      accountLabel: "$10K",
      equity: "10436.20",
      toTarget: "563.80",
      dailyAllowance: "500.00",
      dailyRemaining: "379.60",
      totalFloor: "9000.00",
      resetZone: "Europe/Prague",
    }));
  });
});

describe("challenge results and summary", () => {
  it("calls an unfinished-but-exhausted replay ended, not in progress", () => {
    expect(challengeResult("active", "paused")).toBe("in-progress");
    expect(challengeResult("active", "finished")).toBe("ended");
    expect(challengeResult("passed", "finished")).toBe("passed");
    expect(challengeResult("breached", "paused")).toBe("failed");
  });

  it("reports pass rate over decided attempts, days to pass per phase and the commonest failure", () => {
    const summary = summarizeChallenges([
      { result: "in-progress", breach: null, phase: 1, tradingDays: 6 },
      { result: "passed", breach: null, phase: 2, tradingDays: 9 },
      { result: "passed", breach: null, phase: 1, tradingDays: 14 },
      { result: "failed", breach: "daily-loss", phase: 1, tradingDays: 4 },
      { result: "failed", breach: "total-loss", phase: 1, tradingDays: 11 },
      { result: "failed", breach: "daily-loss", phase: 1, tradingDays: 3 },
    ]);
    expect(summary).toEqual({
      attempts: 6,
      inProgress: 1,
      passed: 2,
      failed: 3,
      passRate: 40,
      daysToPass: { 1: 14, 2: 9 },
      topFailure: { rule: "daily-loss", count: 2 },
    });
  });

  it("has no pass rate before any attempt is decided", () => {
    expect(summarizeChallenges([{ result: "in-progress", breach: null, phase: 1, tradingDays: 0 }]).passRate).toBeNull();
  });
});

describe("formatting and parsing", () => {
  it("formats dollars with signs and optional cents", () => {
    expect(formatUsd("1436.2")).toBe("$1,436.20");
    expect(formatUsd("1436.2", { whole: true })).toBe("$1,436");
    expect(formatUsd(-500)).toBe("−$500.00");
    expect(formatUsd("142.3", { signed: true })).toBe("+$142.30");
    expect(formatUsd(0, { signed: true })).toBe("$0.00");
  });

  it("labels round account sizes in thousands", () => {
    expect(accountSizeLabel("10000")).toBe("$10K");
    expect(accountSizeLabel("200000")).toBe("$200K");
    expect(accountSizeLabel("12500.5")).toBe("$12,500.50");
  });

  it("reads rules back from config and rejects malformed ones", () => {
    expect(parseChallengeRules(rules)).toEqual(rules);
    expect(parseChallengeRules({ ...rules, phase: 3 })).toBeNull();
    expect(parseChallengeRules({ phase: 1 })).toBeNull();
    expect(parseChallengeRules(null)).toBeNull();
  });
});
