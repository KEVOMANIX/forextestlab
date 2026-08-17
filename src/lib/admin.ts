import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/supabase/server";

function configuredValues(name: "ADMIN_EMAILS" | "ADMIN_USER_IDS"): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  const userIds = configuredValues("ADMIN_USER_IDS");
  const emails = configuredValues("ADMIN_EMAILS");
  return (
    userIds.has(user.id.toLowerCase()) ||
    Boolean(user.email && emails.has(user.email.trim().toLowerCase()))
  );
}

export async function requireAdmin(nextPath = "/admin"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/admin/sign-in?next=${encodeURIComponent(nextPath)}`);
  }
  // Signed in without access gets an explanation rather than a 404, for the
  // same reason as the support workspace.
  if (!isAdminUser(user)) redirect("/admin/sign-in?denied=1");
  return user;
}
