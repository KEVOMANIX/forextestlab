import { NextResponse } from "next/server";

import { getSubscriptionManageLink } from "@/lib/billing/paystack";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const subscription = await prisma.billingSubscription.findFirst({
    where: { userId: user.id, status: { in: ["active", "attention", "non-renewing"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (!subscription) return NextResponse.json({ ok: false, error: "No card subscription was found." }, { status: 404 });
  try {
    const url = await getSubscriptionManageLink(subscription.subscriptionCode);
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ ok: false, error: "Subscription management is temporarily unavailable." }, { status: 502 });
  }
}
