import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

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

export async function ensureUserProfile(user: User): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("Your account does not have an email address.");

  const metadataName = [
    user.user_metadata?.display_name,
    user.user_metadata?.full_name,
    user.user_metadata?.name,
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const displayName = metadataName?.trim().slice(0, 120) || null;

  await prisma.userProfile.upsert({
    where: { id: user.id },
    update: { email, displayName },
    create: { id: user.id, email, displayName },
  });
  await claimPaddleSubscriptionForUser(user.id, email);
}
