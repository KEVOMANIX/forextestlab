import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verifyAndRecordPayment } from "@/lib/billing/service";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const reference = new URL(request.url).searchParams.get("reference")?.trim() || "";
  if (!reference) {
    const profile = await prisma.userProfile.findUnique({ where: { id: user.id }, select: { billingStatus: true, proAccessUntil: true } });
    const active = Boolean(profile && (["active", "attention", "non-renewing"].includes(profile.billingStatus) || (profile.proAccessUntil && profile.proAccessUntil > new Date())));
    return NextResponse.json({ ok: true, status: active ? "success" : "pending", message: active ? "Your Pro access is active." : "Waiting for Paddle to confirm the subscription." });
  }
  const payment = await prisma.billingPayment.findUnique({ where: { reference } });
  if (!payment || payment.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
  }
  if (payment.status === "success") {
    return NextResponse.json({ ok: true, status: "success", reference });
  }
  if (["failed", "abandoned", "reversed", "amount_or_plan_mismatch", "initialization_failed"].includes(payment.status)) {
    return NextResponse.json({ ok: true, status: "failed", reference });
  }
  const result = await verifyAndRecordPayment(reference);
  return NextResponse.json({ ok: true, ...result });
}
