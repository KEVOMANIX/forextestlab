import { NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth";
import { isCheckoutProductKey } from "@/lib/billing/catalog";
import { createCheckout } from "@/lib/billing/service";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.json({ ok: false, error: "Sign in to continue." }, { status: 401 });
  await ensureUserProfile(user);
  const limit = rateLimit(`billing-checkout:${user.id || clientIp(request)}`, 8, 15 * 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many checkout attempts. Try again shortly." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { productKey?: unknown } | null;
  if (!isCheckoutProductKey(body?.productKey)) {
    return NextResponse.json({ ok: false, error: "Select a valid payment option." }, { status: 422 });
  }
  try {
    const checkout = await createCheckout({
      userId: user.id,
      email: user.email,
      productKey: body.productKey,
      callbackBaseUrl: new URL(request.url).origin,
    });
    return NextResponse.json({ ok: true, ...checkout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be created.";
    const unavailable = message.includes("not available") || message.includes("not configured");
    return NextResponse.json({ ok: false, error: message }, { status: unavailable ? 503 : 502 });
  }
}
