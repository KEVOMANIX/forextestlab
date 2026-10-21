import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { formatSymbol } from "@/lib/market-data/symbols";

import {
  accountSizeLabel,
  challengeCard,
  challengeResult,
  parseChallengeRules,
  summarizeChallenges,
  type ChallengeCard,
  type ChallengeResult,
  type ChallengeSummary,
} from "./challenge-record";
import { propFirmDayKey, type PropFirmRules } from "./prop-firm";
import { replayDayLabel } from "./replay-progress";

const CHALLENGE_SELECT = {
  id: true,
  symbol: true,
  startTime: true,
  endTime: true,
  status: true,
  visibleTime: true,
  startingBalance: true,
  equity: true,
  maxEquity: true,
  updatedAt: true,
  challengeStatus: true,
  challengeBreach: true,
  challengeDayKey: true,
  challengeDayStartEquity: true,
  challengeTradingDays: true,
} as const;

type ChallengeSessionRow = Prisma.BacktestSessionGetPayload<{ select: typeof CHALLENGE_SELECT }>;

interface ChallengeMetadataRow {
  id: string;
  name: string | null;
  symbols: unknown;
  archived: boolean;
  rules: unknown;
}

/** Name, markets, archive flag and rules, extracted in SQL so snapshots never reach Node. */
async function challengeMetadata(ids: string[]): Promise<Map<string, ChallengeMetadataRow>> {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<ChallengeMetadataRow[]>(Prisma.sql`
    SELECT "id",
           NULLIF("stateJson"::jsonb #>> '{config,name}', '') AS "name",
           COALESCE("stateJson"::jsonb #> '{config,symbols}', jsonb_build_array("symbol")) AS "symbols",
           COALESCE(("stateJson"::jsonb #>> '{config,archived}')::boolean, false) AS "archived",
           "stateJson"::jsonb #> '{config,propFirm}' AS "rules"
    FROM "BacktestSession"
    WHERE "id" IN (${Prisma.join(ids)})
  `);
  return new Map(rows.map((row) => [row.id, row]));
}

interface ResolvedChallenge {
  session: ChallengeSessionRow;
  name: string;
  pairs: string[];
  rules: PropFirmRules;
  result: ChallengeResult;
}

function resolve(sessions: ChallengeSessionRow[], metadata: Map<string, ChallengeMetadataRow>): ResolvedChallenge[] {
  return sessions.flatMap((session) => {
    const details = metadata.get(session.id);
    const rules = parseChallengeRules(details?.rules);
    if (!details || details.archived || !rules) return [];
    const symbols = Array.isArray(details.symbols)
      ? details.symbols.filter((value): value is string => typeof value === "string")
      : [];
    return [{
      session,
      name: details.name?.trim() || `${formatSymbol(session.symbol)} challenge`,
      pairs: (symbols.length ? symbols : [session.symbol]).map(formatSymbol),
      rules,
      result: challengeResult(session.challengeStatus, session.status),
    }];
  });
}

function toCard(challenge: ResolvedChallenge): ChallengeCard {
  const { session } = challenge;
  return challengeCard({
    id: session.id,
    name: challenge.name,
    dayLabel: replayDayLabel({
      startTime: Number(session.startTime),
      endTime: Number(session.endTime),
      currentTime: session.visibleTime != null ? Number(session.visibleTime) : null,
    }),
    row: session,
    rules: challenge.rules,
  });
}

/** The challenge a trader is in the middle of, for the dashboard strip. */
export async function loadActiveChallengeCard(userId: string): Promise<ChallengeCard | null> {
  const sessions = await prisma.backtestSession.findMany({
    where: { userId, anonymous: false, challengeStatus: "active", status: { not: "finished" } },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: CHALLENGE_SELECT,
  });
  const active = resolve(sessions, await challengeMetadata(sessions.map((session) => session.id)))[0];
  return active ? toCard(active) : null;
}

export interface ChallengeAttempt {
  id: string;
  name: string;
  pairs: string[];
  phase: 1 | 2;
  accountLabel: string;
  result: ChallengeResult;
  breach: string | null;
  profitPercent: number;
  tradingDays: number;
}

export interface ChallengeDay {
  key: string;
  label: string;
  pnl: string;
  today: boolean;
}

export interface ChallengesOverview {
  active: ChallengeCard | null;
  /** Closed P/L per firm trading day for the active challenge, oldest first. */
  days: ChallengeDay[];
  attempts: ChallengeAttempt[];
  summary: ChallengeSummary;
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

async function loadChallengeDays(challenge: ResolvedChallenge): Promise<ChallengeDay[]> {
  const zone = challenge.rules.dailyResetZone;
  const trades = await prisma.simulatedTrade.findMany({
    where: { sessionId: challenge.session.id },
    select: { exitTime: true, pnl: true },
  });
  const totals = new Map<string, Decimal>();
  for (const trade of trades) {
    const key = propFirmDayKey(Number(trade.exitTime), zone);
    totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(trade.pnl));
  }
  const today = challenge.session.visibleTime != null ? propFirmDayKey(Number(challenge.session.visibleTime), zone) : null;
  if (today && !totals.has(today)) totals.set(today, new Decimal(0));
  return [...totals.keys()].sort().slice(-8).map((key) => ({
    key,
    label: key === today ? "Today" : DAY_LABEL.format(new Date(`${key}T12:00:00Z`)),
    pnl: totals.get(key)!.toFixed(2),
    today: key === today,
  }));
}

export async function loadChallengesOverview(userId: string): Promise<ChallengesOverview> {
  const sessions = await prisma.backtestSession.findMany({
    where: { userId, anonymous: false, challengeStatus: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: CHALLENGE_SELECT,
  });
  const challenges = resolve(sessions, await challengeMetadata(sessions.map((session) => session.id)));
  const running = challenges.find((challenge) => challenge.result === "in-progress") ?? null;
  const attempts = challenges.map(({ session, name, pairs, rules, result }): ChallengeAttempt => {
    const start = new Decimal(session.startingBalance);
    return {
      id: session.id,
      name,
      pairs,
      phase: rules.phase,
      accountLabel: accountSizeLabel(session.startingBalance),
      result,
      breach: session.challengeBreach,
      profitPercent: start.isZero() ? 0 : new Decimal(session.equity).minus(start).dividedBy(start).times(100).toNumber(),
      tradingDays: session.challengeTradingDays ?? 0,
    };
  });
  return {
    active: running ? toCard(running) : null,
    days: running ? await loadChallengeDays(running) : [],
    attempts,
    summary: summarizeChallenges(attempts),
  };
}
