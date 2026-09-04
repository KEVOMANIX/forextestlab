import { NextResponse } from "next/server";

import { createPaddlePortalSession } from "@/lib/billing/paddle";
import { getSubscriptionManageLink } from "@/lib/billing/paystack";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    const profile = await prisma.userProfile.findUnique({ where: { id: user.id }, select: { paddleCustomerId: true } });
    const subscriptions = await prisma.billingSubscription.findMany({
      where: {
        userId: user.id,
        provider: "paddle",
        productKey: { startsWith: "pro_" },
        status: { in: ["active", "trialing", "past_due"] },
      },
      select: { subscriptionCode: true },
    });
    if (profile?.paddleCustomerId && subscriptions.length > 0) {
      const url = await createPaddlePortalSession(
        profile.paddleCustomerId,
        subscriptions.map((subscription) => subscription.subscriptionCode),
      );
      return NextResponse.json({ ok: true, url });
    }
    const legacy = await prisma.billingSubscription.findFirst({
      where: { userId: user.id, provider: "paystack", status: { in: ["active", "attention", "non-renewing"] } },
      orderBy: { updatedAt: "desc" },
    });
    if (!legacy) return NextResponse.json({ ok: false, error: "No subscription was found." }, { status: 404 });
    return NextResponse.json({ ok: true, url: await getSubscriptionManageLink(legacy.subscriptionCode) });
  } catch {
    return NextResponse.json({ ok: false, error: "Subscription management is temporarily unavailable." }, { status: 502 });
  }
}
