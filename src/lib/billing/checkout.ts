import "server-only";

import { prisma } from "@/lib/db";
import { isProPlan } from "./entitlements";
import { configuredPaddleTierPriceId, proTrialPricesConfigured } from "./tiers";
import type { BillingInterval } from "./tier-types";

/**
 * Whether an account may start the 7-day Pro trial: one per account, never
 * after a previous subscription, and not while already on Pro. Paddle does not
 * limit repeat trials itself, so this is the rule, applied when the server
 * builds the checkout.
 */
export async function proTrialEligible(userId: string): Promise<boolean> {
  if (!proTrialPricesConfigured()) return false;
  const [profile, earlier] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: { id: true, proTrialStartedAt: true, billingStatus: true, proAccessUntil: true },
    }),
    prisma.billingSubscription.count({ where: { userId } }),
  ]);
  if (!profile || profile.proTrialStartedAt || earlier > 0) return false;
  return !isProPlan(profile);
}

/** The Paddle price this account is offered for a plan interval, and whether it carries the trial. */
export async function checkoutPrice(userId: string, interval: BillingInterval): Promise<{ priceId: string; trial: boolean } | null> {
  const trial = await proTrialEligible(userId);
  const priceId = configuredPaddleTierPriceId("pro", interval, trial);
  return priceId ? { priceId, trial } : null;
}
