/**
 * Prop-firm challenge records.
 *
 * A challenge's live rule state lives in the engine snapshot, which for a large
 * session is an R2 object. The dashboard, session lists and the Challenges page
 * need that state for every challenge at once, so a few fields are mirrored
 * onto the session row on every save. A null `challengeStatus` marks an
 * ordinary backtest, and that one column is what keeps challenges out of
 * practice statistics.
 */

import { d } from "@/lib/decimal";

import {
  propFirmDayKey,
  propFirmProgress,
  type PropFirmBreachRule,
  type PropFirmProgress,
  type PropFirmRules,
} from "./prop-firm";
import type { SessionState } from "./types";

export type ChallengeStatus = "active" | "passed" | "breached";

export interface ChallengeColumns {
  challengeStatus: ChallengeStatus | null;
  challengeBreach: PropFirmBreachRule | null;
  challengeDayKey: string | null;
  challengeDayStartEquity: string | null;
  challengeTradingDays: number | null;
}

/** The row columns that mirror a session's challenge state; all null for practice. */
export function challengeColumns(state: Pick<SessionState, "config" | "propFirm">): ChallengeColumns {
  if (!state.config.propFirm) {
    return {
      challengeStatus: null,
      challengeBreach: null,
      challengeDayKey: null,
      challengeDayStartEquity: null,
      challengeTradingDays: null,
    };
  }
  const runtime = state.propFirm;
  return {
    challengeStatus: runtime?.status ?? "active",
    challengeBreach: runtime?.breach?.rule ?? null,
    challengeDayKey: runtime?.dayKey ?? null,
    challengeDayStartEquity: runtime?.dayStartEquity ?? null,
    challengeTradingDays: runtime?.tradingDays.length ?? 0,
  };
}

/** Rules read back from a session's compact config, or null when malformed. */
export function parseChallengeRules(value: unknown): PropFirmRules | null {
  if (!value || typeof value !== "object") return null;
  const rules = value as Partial<PropFirmRules>;
  const numbers = [rules.profitTargetPercent, rules.maxDailyLossPercent, rules.maxTotalLossPercent, rules.minTradingDays];
  if (numbers.some((number) => typeof number !== "number" || !Number.isFinite(number))) return null;
  if (rules.phase !== 1 && rules.phase !== 2) return null;
  return {
    preset: rules.preset ?? "custom",
    phase: rules.phase,
    profitTargetPercent: rules.profitTargetPercent!,
    maxDailyLossPercent: rules.maxDailyLossPercent!,
    maxTotalLossPercent: rules.maxTotalLossPercent!,
    lossBasis: rules.lossBasis === "peak-equity" ? "peak-equity" : "initial",
    dailyResetZone: typeof rules.dailyResetZone === "string" ? rules.dailyResetZone : "UTC",
    minTradingDays: rules.minTradingDays!,
  };
}

export interface ChallengeRow {
  startingBalance: string;
  equity: string;
  maxEquity: string;
  visibleTime: bigint | null;
  challengeStatus: string | null;
  challengeDayKey: string | null;
  challengeDayStartEquity: string | null;
  challengeTradingDays: number | null;
}

/**
 * Rule progress from a session row, without its snapshot.
 *
 * A checkpoint that only moves the replay cursor does not save the engine
 * state, and the client sends one only when no position or order could have
 * changed equity. So when the replay has crossed into a new firm day since the
 * last full save, that day opened at the equity the row already holds.
 */
export function challengeProgress(row: ChallengeRow, rules: PropFirmRules): PropFirmProgress {
  const replayDay = row.visibleTime != null ? propFirmDayKey(Number(row.visibleTime), rules.dailyResetZone) : null;
  const dayRolled = replayDay !== null && replayDay !== row.challengeDayKey;
  return propFirmProgress({
    rules,
    startingBalance: row.startingBalance,
    equity: row.equity,
    peakEquity: row.maxEquity,
    runtime: {
      status: isChallengeStatus(row.challengeStatus) ? row.challengeStatus : "active",
      breach: null,
      dayKey: replayDay ?? row.challengeDayKey ?? "",
      dayStartEquity: dayRolled || !row.challengeDayStartEquity ? row.equity : row.challengeDayStartEquity,
      tradingDays: Array.from({ length: row.challengeTradingDays ?? 0 }, (_, index) => String(index)),
    },
  });
}

function isChallengeStatus(value: string | null): value is ChallengeStatus {
  return value === "active" || value === "passed" || value === "breached";
}

/** What a challenge came to, as a trader would put it. */
export type ChallengeResult = "in-progress" | "passed" | "failed" | "ended";

export function challengeResult(status: string | null, sessionStatus: string): ChallengeResult {
  if (status === "passed") return "passed";
  if (status === "breached") return "failed";
  // The replay ran out of data before the target was met.
  return sessionStatus === "finished" ? "ended" : "in-progress";
}

/** Everything the gauges and the dashboard strip show for one running challenge. */
export interface ChallengeCard {
  id: string;
  name: string;
  phase: 1 | 2;
  accountLabel: string;
  dayLabel: string;
  equity: string;
  profit: string;
  profitPercent: number;
  targetPercent: number;
  targetEquity: string;
  targetProgress: number;
  toTarget: string;
  dailyPercent: number;
  dailyAllowance: string;
  dailyRemaining: string;
  dailyUsedRatio: number;
  totalPercent: number;
  totalFloor: string;
  totalRemaining: string;
  totalUsedRatio: number;
  tradingDays: number;
  /** IANA zone whose midnight resets the daily limit. */
  resetZone: string;
}

export function challengeCard(input: {
  id: string;
  name: string;
  dayLabel: string;
  row: ChallengeRow;
  rules: PropFirmRules;
}): ChallengeCard {
  const { row, rules } = input;
  const progress = challengeProgress(row, rules);
  const reference = d(rules.lossBasis === "peak-equity" ? row.maxEquity : row.startingBalance);
  const toTarget = d(progress.targetEquity).minus(row.equity);
  return {
    id: input.id,
    name: input.name,
    phase: rules.phase,
    accountLabel: accountSizeLabel(row.startingBalance),
    dayLabel: input.dayLabel,
    equity: d(row.equity).toFixed(2),
    profit: progress.profit,
    profitPercent: progress.profitPercent,
    targetPercent: rules.profitTargetPercent,
    targetEquity: progress.targetEquity,
    targetProgress: progress.targetProgress,
    toTarget: toTarget.isNegative() ? "0.00" : toTarget.toFixed(2),
    dailyPercent: rules.maxDailyLossPercent,
    dailyAllowance: reference.times(rules.maxDailyLossPercent).dividedBy(100).toFixed(2),
    dailyRemaining: progress.dailyRemaining,
    dailyUsedRatio: progress.dailyUsedRatio,
    totalPercent: rules.maxTotalLossPercent,
    totalFloor: progress.totalFloor,
    totalRemaining: progress.totalRemaining,
    totalUsedRatio: progress.totalUsedRatio,
    tradingDays: progress.tradingDays,
    resetZone: rules.dailyResetZone,
  };
}

/** "$1,436.20"; `signed` adds + or −, `whole` drops the cents. */
export function formatUsd(value: string | number, options: { signed?: boolean; whole?: boolean } = {}): string {
  const amount = d(value);
  const sign = amount.isZero() ? "" : amount.isNegative() ? "−" : options.signed ? "+" : "";
  const [whole, fraction] = amount.abs().toFixed(options.whole ? 0 : 2).split(".");
  return `${sign}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}

export function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(2)}%`;
}

/** "Prague" from "Europe/Prague", for "resets at midnight, Prague time". */
export function zoneCity(zone: string): string {
  return zone.split("/").pop()!.replace(/_/g, " ");
}

/** "$10K" for the round account sizes challenges use; exact dollars otherwise. */
export function accountSizeLabel(startingBalance: string): string {
  const value = d(startingBalance);
  if (value.greaterThanOrEqualTo(1000) && value.modulo(1000).isZero()) {
    return `$${value.dividedBy(1000).toNumber().toLocaleString("en-US")}K`;
  }
  return `$${value.toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ChallengeSummary {
  attempts: number;
  inProgress: number;
  passed: number;
  failed: number;
  /** Passed as a share of attempts that reached a result; null before any did. */
  passRate: number | null;
  /** Average trading days taken by passed attempts, per phase. */
  daysToPass: { 1: number | null; 2: number | null };
  topFailure: { rule: PropFirmBreachRule; count: number } | null;
}

export function summarizeChallenges(attempts: Array<{
  result: ChallengeResult;
  breach: string | null;
  phase: 1 | 2;
  tradingDays: number;
}>): ChallengeSummary {
  const count = (result: ChallengeResult) => attempts.filter((attempt) => attempt.result === result).length;
  const passed = count("passed");
  const failed = count("failed");
  const decided = passed + failed + count("ended");
  const averageDays = (phase: 1 | 2) => {
    const days = attempts.filter((attempt) => attempt.result === "passed" && attempt.phase === phase).map((attempt) => attempt.tradingDays);
    return days.length ? Math.round(days.reduce((total, value) => total + value, 0) / days.length) : null;
  };
  const failures = new Map<PropFirmBreachRule, number>();
  for (const attempt of attempts) {
    if (attempt.result !== "failed" || (attempt.breach !== "daily-loss" && attempt.breach !== "total-loss")) continue;
    failures.set(attempt.breach, (failures.get(attempt.breach) ?? 0) + 1);
  }
  const [topRule, topCount] = [...failures.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  return {
    attempts: attempts.length,
    inProgress: count("in-progress"),
    passed,
    failed,
    passRate: decided ? (passed / decided) * 100 : null,
    daysToPass: { 1: averageDays(1), 2: averageDays(2) },
    topFailure: topRule ? { rule: topRule, count: topCount! } : null,
  };
}

export const BREACH_SHORT_LABELS: Record<PropFirmBreachRule, string> = {
  "daily-loss": "Daily loss",
  "total-loss": "Max loss",
};
