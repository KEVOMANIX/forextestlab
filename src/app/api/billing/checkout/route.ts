import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserProfile } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing/availability";
import { checkoutPrice } from "@/lib/billing/checkout";
import { createPaddleCheckoutTransaction } from "@/lib/billing/paddle";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ interval: z.enum(["month", "year"]) });

/**
 * Creates the Paddle checkout for a Pro plan. The server chooses the price, so
 * the 7-day trial is offered only to an eligible account and cannot be claimed
 * twice by sending a different price from the browser.
 */
export async function POST(request: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ ok: false, error: "Checkout is not open yet." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to choose a plan." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Choose monthly or yearly." }, { status: 400 });
  if (!rateLimit(`checkout:${user.id}`, 10, 60 * 60_000).ok) {
    return NextResponse.json({ ok: false, error: "Please wait a moment before trying again." }, { status: 429 });
  }
  await ensureUserProfile(user);

  const [price, profile] = await Promise.all([
    checkoutPrice(user.id, parsed.data.interval),
    prisma.userProfile.findUnique({ where: { id: user.id }, select: { paddleCustomerId: true } }),
  ]);
  if (!price) {
    console.error("Checkout requested but the Paddle price for this plan is not configured.");
    return NextResponse.json({ ok: false, error: "This plan is not available yet." }, { status: 503 });
  }
  try {
    const transaction = await createPaddleCheckoutTransaction({
      priceId: price.priceId,
      customerId: profile?.paddleCustomerId,
      customData: { userId: user.id, productKey: `pro_${parsed.data.interval}` },
    });
    return NextResponse.json({ ok: true, transactionId: transaction.id, trial: price.trial });
  } catch (error) {
    console.error("Paddle checkout could not be created:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Checkout could not be opened. Please try again." }, { status: 502 });
  }
}
