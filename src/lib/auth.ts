import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/db";
import { claimPaddleSubscriptionForUser } from "@/lib/billing/paddle-service";
import { getCurrentUser } from "@/lib/supabase/server";

export async function requireUser(nextPath = "/app"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

/**
 * Keeps the profile row in step with the signed-in account.
 *
 * It used to upsert the profile and then look up a Paddle claim on every page
 * view: two round trips in a row, one of them a write. It now reads both at
 * once and writes only when something changed, once per request.
 */
export const ensureUserProfile = cache(async (user: User): Promise<void> => {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("Your account does not have an email address.");

  const metadataName = [
    user.user_metadata?.display_name,
    user.user_metadata?.full_name,
    user.user_metadata?.name,
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const displayName = metadataName?.trim().slice(0, 120) || null;

  const [existing, pendingClaims] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: user.id }, select: { email: true, displayName: true } }),
    prisma.paddleCustomerClaim.count({ where: { email } }),
  ]);
  if (!existing || existing.email !== email || existing.displayName !== displayName) {
    await prisma.userProfile.upsert({
      where: { id: user.id },
      update: { email, displayName },
      create: { id: user.id, email, displayName },
    });
  }
  if (pendingClaims) await claimPaddleSubscriptionForUser(user.id, email);
});
