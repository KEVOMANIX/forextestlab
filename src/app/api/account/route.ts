import { after, NextResponse } from "next/server";

import { cancelPaddleSubscriptionNow } from "@/lib/billing/paddle";
import { disablePaystackSubscription } from "@/lib/billing/paystack";
import { sendOperationalAlert } from "@/lib/contact-email";
import { prisma } from "@/lib/db";
import { accountDeletedEmail } from "@/lib/lifecycle-email";
import { accountName, sendLifecycleEmail } from "@/lib/lifecycle-send";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const value = (payload as { displayName?: unknown } | null)?.displayName;
  const displayName = typeof value === "string" ? value.trim() : "";
  if (displayName.length < 2 || displayName.length > 80) {
    return NextResponse.json(
      { ok: false, error: "Display name must be between 2 and 80 characters." },
      { status: 422 },
    );
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Profile updates are temporarily unavailable." },
      { status: 503 },
    );
  }

  const { error } = await supabase.auth.updateUser({
    data: { display_name: displayName },
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Your profile could not be updated." }, { status: 500 });
  }

  await prisma.userProfile.update({
    where: { id: user.id },
    data: { displayName },
  });

  return NextResponse.json({ ok: true, displayName });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Account deletion is temporarily unavailable. Please contact support." },
      { status: 503 },
    );
  }

  // A deleted account must stop being charged. Live subscriptions are cancelled
  // first; a refusal does not block the deletion, but is recorded for the team
  // (and the customer is told) so it can be cancelled by hand.
  const [profile, subscriptions] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: user.id }, select: { email: true, displayName: true } }),
    prisma.billingSubscription.findMany({
      where: { userId: user.id, status: { in: ["active", "trialing", "past_due", "attention", "non-renewing"] } },
      select: { subscriptionCode: true, provider: true, status: true },
    }),
  ]);
  const failures: string[] = [];
  for (const subscription of subscriptions) {
    try {
      if (subscription.provider === "paddle") await cancelPaddleSubscriptionNow(subscription.subscriptionCode);
      else if (subscription.status !== "non-renewing") await disablePaystackSubscription(subscription.subscriptionCode);
    } catch (cancelError) {
      failures.push(`${subscription.provider} ${subscription.subscriptionCode}: ${cancelError instanceof Error ? cancelError.message : "failed"}`);
    }
  }
  if (failures.length) {
    await prisma.adminAuditEvent.create({
      data: {
        actorUserId: "system",
        actorEmail: "system",
        action: "billing.cancel_on_delete_failed",
        targetType: "user",
        targetId: user.id,
        metadataJson: JSON.stringify({ email: profile?.email ?? user.email, failures }),
      },
    });
    after(() => sendOperationalAlert({
      status: "failed",
      summary: "Cancel a deleted customer's subscription by hand",
      details: [`Account: ${profile?.email ?? user.email ?? user.id}`, ...failures],
    }).catch((alertError) => console.error("Could not send the cancellation alert:", alertError)));
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // The database relation cascades sessions, orders, trades, and equity rows.
  await prisma.userProfile.deleteMany({ where: { id: user.id } });
  const email = profile?.email ?? user.email;
  after(() => sendLifecycleEmail(`account_deleted:${user.id}`, email, accountDeletedEmail(
    profile?.displayName ?? accountName(user),
    failures.length ? "failed" : subscriptions.length ? "cancelled" : "none",
  )));
  return NextResponse.json({ ok: true });
}
