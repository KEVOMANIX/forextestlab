import { NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth";
import { checkoutProductReady, getCheckoutProduct, isCheckoutProductKey } from "@/lib/billing/catalog";
import { configuredPaddleClientToken, paddleMode } from "@/lib/billing/paddle";
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
    if (!checkoutProductReady(body.productKey)) throw new Error("Paddle checkout is not configured yet.");
    const product = getCheckoutProduct(body.productKey);
    return NextResponse.json({
      ok: true,
      clientToken: configuredPaddleClientToken(),
      environment: paddleMode() === "live" ? "production" : "sandbox",
      priceId: product.planCode,
      userId: user.id,
      email: user.email,
      productKey: product.key,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be created.";
    const unavailable = message.includes("not available") || message.includes("not configured");
    return NextResponse.json({ ok: false, error: message }, { status: unavailable ? 503 : 502 });
  }
}
