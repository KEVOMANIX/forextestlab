import { NextResponse } from "next/server";
import { z } from "zod";

import { getPaddleInstance } from "@/lib/billing/paddle";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  action: z.enum(["cancel", "renew"]),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid renewal request." }, { status: 400 });
  }

  const [profile, localSubscription] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { paddleCustomerId: true },
    }),
    prisma.billingSubscription.findFirst({
      where: {
        userId: user.id,
        provider: "paddle",
        status: { in: ["active", "trialing"] },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  if (!profile?.paddleCustomerId || !localSubscription) {
    return NextResponse.json({ ok: false, error: "No active Paddle subscription was found." }, { status: 404 });
  }

  try {
    const paddle = getPaddleInstance();
    const current = await paddle.subscriptions.get(localSubscription.subscriptionCode);
    if (current.customerId !== profile.paddleCustomerId) {
      return NextResponse.json({ ok: false, error: "Subscription ownership could not be verified." }, { status: 403 });
    }
    if (!["active", "trialing"].includes(current.status)) {
      return NextResponse.json({ ok: false, error: "This subscription cannot be changed in its current state." }, { status: 409 });
    }

    const isScheduledToCancel = current.scheduledChange?.action === "cancel";
    if (parsed.data.action === "cancel" && !isScheduledToCancel) {
      await paddle.subscriptions.cancel(current.id, { effectiveFrom: "next_billing_period" });
    } else if (parsed.data.action === "renew" && isScheduledToCancel) {
      await paddle.subscriptions.update(current.id, { scheduledChange: null });
    }

    const cancelAtPeriodEnd = parsed.data.action === "cancel";
    await prisma.$transaction([
      prisma.billingSubscription.update({
        where: { id: localSubscription.id },
        data: { cancelAtPeriodEnd },
      }),
      prisma.paddleCustomerClaim.updateMany({
        where: { subscriptionId: localSubscription.subscriptionCode },
        data: { cancelAtPeriodEnd },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      autoRenew: !cancelAtPeriodEnd,
      message: cancelAtPeriodEnd
        ? "Automatic renewal is off. Your access continues until the end of this billing period."
        : "Automatic renewal is on.",
    });
  } catch (error) {
    console.error("Could not update Paddle renewal preference.", error);
    return NextResponse.json(
      { ok: false, error: "Your renewal preference could not be updated. Please try again." },
      { status: 502 },
    );
  }
}
