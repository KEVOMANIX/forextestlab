import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3 } from "lucide-react";

import { BillingResultCard } from "@/components/billing/BillingResultCard";
import { PaymentStatusPoller } from "@/components/billing/PaymentStatusPoller";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return <BillingResultCard icon={CircleCheck} tone="success" eyebrow="Payment received" title="Welcome to ForexTestLab" message="Create or sign in to your account with the email used at checkout to access your workspace."><Link href="/sign-up?next=/welcome" className="btn-primary w-full">Continue to your account <ArrowRight size={15} aria-hidden /></Link></BillingResultCard>;
  }
  const profile = await prisma.userProfile.findUnique({ where: { id: user.id }, select: { billingStatus: true, proAccessUntil: true } });
  const active = Boolean(profile && (["active", "attention", "non-renewing"].includes(profile.billingStatus) || (profile.proAccessUntil && profile.proAccessUntil > new Date())));
  if (!active) {
    return <BillingResultCard icon={Clock3} tone="pending" eyebrow="Payment received" title="Activating your workspace" message="Paddle is confirming your subscription. This normally takes only a few seconds."><PaymentStatusPoller /></BillingResultCard>;
  }
  return <BillingResultCard icon={CircleCheck} tone="success" eyebrow="Subscription active" title="Your workspace is ready" message="Your subscription is active and your testing workspace is unlocked."><Link href="/app" className="btn-primary w-full">Open dashboard <ArrowRight size={15} aria-hidden /></Link></BillingResultCard>;
}
