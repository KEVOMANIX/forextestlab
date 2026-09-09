import { NextResponse } from "next/server";

import { ensureUserProfile, requireUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getPublicRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/**
 * Where sign-in lands, and nothing more: it decides between the workspace and
 * pricing, then redirects.
 *
 * A route handler rather than a page, because a page cannot redirect without
 * being seen. The account layout streams its nav and footer as soon as the
 * request arrives, so by the time the entitlement read finished and `redirect`
 * ran, HTML was already on screen — which is why signing in showed a loader,
 * then an empty shell, then the destination's loader. A handler returns a
 * redirect response and no markup at all, so the browser goes straight there.
 */
export async function GET(request: Request) {
  const user = await requireUser("/account/continue");
  await ensureUserProfile(user);
  const entitlements = await getUserEntitlements(user.id);

  return NextResponse.redirect(
    new URL(
      entitlements.plan === "pro" ? "/app" : "/pricing?from=sign-in",
      // Behind Cloudflare and Nginx, request.url is the loopback address the
      // proxy dialled; redirecting to that would send the browser to
      // 127.0.0.1. Same helper the OAuth callback uses.
      getPublicRequestOrigin(request),
    ),
  );
}
