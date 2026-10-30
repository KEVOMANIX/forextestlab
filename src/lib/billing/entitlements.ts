import "server-only";

import type { UserProfile } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import { isAdminUserId } from "@/lib/admin";
import { billingEnabled } from "./availability";
import type { PlanEntitlements } from "./entitlement-types";
import { freePreviewActive } from "./plan-preview";
import {
  FREE_MAX_REPLAY_SPEED,
  FREE_MONTHLY_SESSIONS,
  FREE_SESSION_DAYS,
  FREE_SESSION_MAX_MS,
  FREE_SYMBOLS,
  formatQuotaReset,
  isFreeSymbol,
  PRO_MAX_REPLAY_SPEED,
  quotaMonth,
  quotaResetsAt,
} from "./plan-limits";

export { FREE_SESSION_MAX_MS } from "./plan-limits";

type BillingProfile = Pick<UserProfile, "billingStatus" | "proAccessUntil"> & Partial<Pick<UserProfile, "id">>;

/**
 * Pro comes from a live subscription (a Paddle trial is reported as "active"
 * while trialing), a renewal still in its grace period ("attention"), a
 * Paystack plan running out its paid term ("non-renewing"), or dated access
 * from a pass or an admin grant.
 */
export function hasProAccess(profile: BillingProfile, now = new Date()): boolean {
  return (
    isAdminUserId(profile.id) ||
    ["active", "attention", "non-renewing"].includes(profile.billingStatus) ||
    Boolean(profile.proAccessUntil && profile.proAccessUntil > now)
  );
}

/** Whether an account is on Pro, including everyone while billing is switched off. */
export function isProPlan(profile: BillingProfile, now = new Date()): boolean {
  return !billingEnabled() || hasProAccess(profile, now);
}

export function planEntitlements(
  profile: BillingProfile,
  options: { freeSessionsUsed?: number; trialEndsAt?: Date | null; now?: Date; previewFree?: boolean } = {},
): PlanEntitlements {
  const now = options.now ?? new Date();
  // Before launch, full access is available without a subscription. This lives
  // at the entitlement boundary so API calls cannot keep Free limits. An
  // admin's "view as Free" preview overrides it for that admin only.
  const pro = !options.previewFree && isProPlan(profile, now);
  if (pro) {
    return {
      plan: "pro",
      trialEndsAt: !isAdminUserId(profile.id) && billingEnabled() && options.trialEndsAt && options.trialEndsAt > now ? options.trialEndsAt.toISOString() : null,
      monthlySessions: null,
      allowedSymbols: null,
      maxSessionDays: null,
      maxPairsPerSession: null,
      maxReplaySpeed: PRO_MAX_REPLAY_SPEED,
      fullAnalytics: true,
      exports: true,
      propFirmChallenges: true,
    };
  }
  const used = Math.max(0, options.freeSessionsUsed ?? 0);
  return {
    plan: "free",
    ...(options.previewFree ? { preview: true } : {}),
    trialEndsAt: null,
    monthlySessions: {
      limit: FREE_MONTHLY_SESSIONS,
      used,
      remaining: Math.max(0, FREE_MONTHLY_SESSIONS - used),
      resetsAt: quotaResetsAt(now).toISOString(),
    },
    allowedSymbols: FREE_SYMBOLS,
    maxSessionDays: FREE_SESSION_DAYS,
    maxPairsPerSession: 1,
    maxReplaySpeed: FREE_MAX_REPLAY_SPEED,
    fullAnalytics: false,
    exports: false,
    propFirmChallenges: false,
  };
}

export async function getUserEntitlements(userId: string, now = new Date()): Promise<PlanEntitlements> {
  const [profile, usage, trial, previewFree] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: { id: true, billingStatus: true, proAccessUntil: true },
    }),
    prisma.freeSessionUsage.findUnique({
      where: { userId_month: { userId, month: quotaMonth(now) } },
      select: { used: true },
    }),
    prisma.billingSubscription.findFirst({
      where: { userId, status: "trialing", trialEndsAt: { gt: now } },
      orderBy: { trialEndsAt: "desc" },
      select: { trialEndsAt: true },
    }),
    freePreviewActive(userId),
  ]);
  if (!profile) throw new Error("Account profile not found.");
  return planEntitlements(profile, { freeSessionsUsed: usage?.used ?? 0, trialEndsAt: trial?.trialEndsAt, now, previewFree });
}

/** The sidebar's plan card: Free sessions this month, or null on Pro. */
export interface FreePlanSummary {
  used: number;
  limit: number;
  /** ISO start of the next UTC calendar month. */
  resetsAt: string;
}

/** What shared chrome (the sidebar) shows for a Free account: two small queries. */
export async function freePlanSummary(userId: string, now = new Date()): Promise<FreePlanSummary | null> {
  const [profile, usage, previewFree] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: userId }, select: { id: true, billingStatus: true, proAccessUntil: true } }),
    prisma.freeSessionUsage.findUnique({ where: { userId_month: { userId, month: quotaMonth(now) } }, select: { used: true } }),
    freePreviewActive(userId),
  ]);
  const free = previewFree || (profile ? !isProPlan(profile, now) : billingEnabled());
  if (!free) return null;
  return { used: Math.min(usage?.used ?? 0, FREE_MONTHLY_SESSIONS), limit: FREE_MONTHLY_SESSIONS, resetsAt: quotaResetsAt(now).toISOString() };
}

/** The message for a Free account that has started its sessions for the month. */
export function monthlyQuotaMessage(resetsAt: Date | string): string {
  return `You've started your ${FREE_MONTHLY_SESSIONS} free sessions this month. More arrive on ${formatQuotaReset(resetsAt)}, or upgrade to Pro for unlimited sessions.`;
}

/**
 * Server-side checks for a new session. The UI shows the same limits as locks,
 * but these are the access control.
 */
export function assertSessionAllowed(
  entitlements: PlanEntitlements,
  input: {
    symbols: string[];
    startTime: number;
    endTime: number;
    propFirm?: unknown;
  },
): void {
  if (input.propFirm && !entitlements.propFirmChallenges) {
    throw new Error("Prop Firm Challenge mode is part of Pro. Upgrade or start a Pro trial to use it.");
  }
  if (
    entitlements.maxPairsPerSession !== null &&
    input.symbols.length > entitlements.maxPairsPerSession
  ) {
    throw new Error("Free sessions replay one pair. Multi-pair replay is part of Pro.");
  }
  if (entitlements.allowedSymbols && !input.symbols.every(isFreeSymbol)) {
    throw new Error("Free sessions use the major FX pairs. All 39 markets are part of Pro.");
  }
  if (
    entitlements.maxSessionDays !== null &&
    input.endTime - input.startTime > FREE_SESSION_MAX_MS
  ) {
    throw new Error("Free sessions cover up to 31 days. Longer periods are part of Pro.");
  }
}
