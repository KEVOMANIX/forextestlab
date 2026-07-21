import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3 } from "lucide-react";

import { BillingResultCard } from "@/components/billing/BillingResultCard";
import { PaymentStatusPoller } from "@/components/billing/PaymentStatusPoller";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Payment received", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BillingSuccessPage() {
  const user = await requireUser("/billing/success");
  const profile = await prisma.userProfile.findUnique({ where: { id: user.id }, select: { billingStatus: true, proAccessUntil: true } });
  const active = Boolean(profile && (["active", "attention", "non-renewing"].includes(profile.billingStatus) || (profile.proAccessUntil && profile.proAccessUntil > new Date())));
  if (!active) {
    return <BillingResultCard icon={Clock3} tone="pending" eyebrow="Payment received" title="Activating your Pro workspace" message="Paddle is confirming your subscription. This normally takes only a few seconds."><PaymentStatusPoller /></BillingResultCard>;
  }
  return <BillingResultCard icon={CircleCheck} tone="success" eyebrow="Subscription active" title="Your Pro workspace is active" message="Paddle confirmed your subscription and Pro access has been applied."><div className="grid gap-3 sm:grid-cols-2"><Link href="/app" className="btn-primary">Open dashboard <ArrowRight size={15} aria-hidden /></Link><Link href="/account/billing" className="btn-secondary">View billing</Link></div></BillingResultCard>;
}
