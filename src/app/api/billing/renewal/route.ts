import { NextResponse } from "next/server";
import { z } from "zod";

import {
  cancelPaddleSubscription,
  getPaddleSubscription,
  resumePaddleSubscriptionRenewal,
} from "@/lib/billing/paddle";
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
    const current = await getPaddleSubscription(localSubscription.subscriptionCode);
    if (current.customer_id !== profile.paddleCustomerId) {
      return NextResponse.json({ ok: false, error: "Subscription ownership could not be verified." }, { status: 403 });
    }
    if (!["active", "trialing"].includes(current.status)) {
      return NextResponse.json({ ok: false, error: "This subscription cannot be changed in its current state." }, { status: 409 });
    }

    const isScheduledToCancel = current.scheduled_change?.action === "cancel";
    if (parsed.data.action === "cancel" && !isScheduledToCancel) {
      await cancelPaddleSubscription(current.id);
    } else if (parsed.data.action === "renew" && isScheduledToCancel) {
      await resumePaddleSubscriptionRenewal(current.id);
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

    // Cancelling during a trial cancels at the end of the current period,
    // which during a trial is the trial itself: Pro until then, and no charge.
    const trialEnd = current.status === "trialing" ? localSubscription.trialEndsAt ?? localSubscription.nextPaymentAt : null;
    const trialEndLabel = trialEnd
      ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(trialEnd)
      : "the end of your trial";
    return NextResponse.json({
      ok: true,
      autoRenew: !cancelAtPeriodEnd,
      message: cancelAtPeriodEnd
        ? current.status === "trialing"
          ? `Your trial is cancelled and your card won't be charged. Pro stays until ${trialEndLabel}, then your account moves to Free.`
          : "Automatic renewal is off. Your access continues until the end of this billing period."
        : current.status === "trialing"
          ? `Your plan is back on. Your card will be charged when the trial ends on ${trialEndLabel}.`
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
