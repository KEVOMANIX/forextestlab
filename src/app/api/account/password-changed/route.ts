import { NextResponse } from "next/server";

import { passwordChangedEmail } from "@/lib/lifecycle-email";
import { accountName, sendLifecycleEmail } from "@/lib/lifecycle-send";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called by the password form once Supabase has changed the password (that
 * happens in the browser). The notice goes to the signed-in account's own
 * address only, so the worst a repeated call can do is email its own owner;
 * the rate limit stops even that.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  if (!rateLimit(`password-changed:${user.id}`, 3, 60 * 60_000).ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const at = new Date();
  await sendLifecycleEmail(`password:${user.id}:${at.getTime()}`, user.email,
    passwordChangedEmail({ name: accountName(user), email: user.email, at }));
  return NextResponse.json({ ok: true });
}
