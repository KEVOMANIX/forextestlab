import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
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

  const displayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim().slice(0, 120) || null
      : null;

  await prisma.userProfile.upsert({
    where: { id: user.id },
    update: { email, displayName },
    create: { id: user.id, email, displayName },
  });
}
