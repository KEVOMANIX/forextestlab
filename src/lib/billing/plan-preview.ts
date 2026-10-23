import "server-only";

import { cookies } from "next/headers";

import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Admin-only "view as Free": with this cookie set, an admin account is treated
 * exactly like a Free account (limits, locks and server checks), so the plan
 * can be seen on the live site while billing is still off for everyone else.
 * Ignored for anyone who is not an admin, and outside a request.
 */
export const PLAN_PREVIEW_COOKIE = "ftl_plan_preview";

export async function freePreviewActive(userId?: string): Promise<boolean> {
  try {
    if ((await cookies()).get(PLAN_PREVIEW_COOKIE)?.value !== "free") return false;
    const user = await getCurrentUser();
    return Boolean(user && (!userId || user.id === userId) && isAdminUser(user));
  } catch {
    // No request scope (scripts, background work): never a preview.
    return false;
  }
}
