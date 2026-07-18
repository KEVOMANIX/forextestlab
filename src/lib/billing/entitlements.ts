import "server-only";

import type { UserProfile } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { PlanEntitlements } from "./entitlement-types";

export const FREE_SESSION_MAX_MS = 31 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000;

type BillingProfile = Pick<
  UserProfile,
  "billingStatus" | "proAccessUntil" | "freeSessionUsedAt"
>;

export function hasProAccess(profile: BillingProfile, now = new Date()): boolean {
  return (
    ["active", "attention", "non-renewing"].includes(profile.billingStatus) ||
    Boolean(profile.proAccessUntil && profile.proAccessUntil > now)
  );
}

export function planEntitlements(profile: BillingProfile): PlanEntitlements {
  const pro = hasProAccess(profile);
  return {
    plan: pro ? "pro" : "free",
    maxSavedSessions: pro ? null : 1,
    maxSessionDays: pro ? null : 31,
    maxPairsPerSession: pro ? null : 1,
    maxReplaySpeed: pro ? 7200 : 300,
    fullAnalytics: pro,
    csvExports: pro,
    freeSessionUsed: Boolean(profile.freeSessionUsedAt),
  };
}

export async function getUserEntitlements(userId: string): Promise<PlanEntitlements> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      billingStatus: true,
      proAccessUntil: true,
      freeSessionUsedAt: true,
    },
  });
  if (!profile) throw new Error("Account profile not found.");
  return planEntitlements(profile);
}

export function assertSessionAllowed(
  entitlements: PlanEntitlements,
  input: { symbols: string[]; startTime: number; endTime: number },
): void {
  if (
    entitlements.maxPairsPerSession !== null &&
    input.symbols.length > entitlements.maxPairsPerSession
  ) {
    throw new Error("Free sessions support one pair. Upgrade to Pro for multi-pair backtests.");
  }
  if (
    entitlements.maxSessionDays !== null &&
    input.endTime - input.startTime > FREE_SESSION_MAX_MS
  ) {
    throw new Error("A Free session can cover up to one month (31 days). Choose a shorter range or upgrade to Pro.");
  }
  if (entitlements.plan === "free" && entitlements.freeSessionUsed) {
    throw new Error("Your one Free backtest session has already been used. Upgrade to Pro to create another session.");
  }
}
