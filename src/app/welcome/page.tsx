import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3 } from "lucide-react";

import { BillingResultCard } from "@/components/billing/BillingResultCard";
import { PaymentStatusPoller } from "@/components/billing/PaymentStatusPoller";
import { hasProAccess } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Where Paddle checkout returns: a paid plan or a free trial, being confirmed by webhook. */
export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return <BillingResultCard icon={CircleCheck} tone="success" eyebrow="Checkout complete" title="Welcome to ForexTestLab" message="Create or sign in to your account with the email used at checkout to access your workspace."><Link href="/sign-up?next=/welcome" className="btn-primary w-full">Continue to your account <ArrowRight size={15} aria-hidden /></Link></BillingResultCard>;
  }
  const [profile, trial] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: user.id }, select: { id: true, billingStatus: true, proAccessUntil: true } }),
    prisma.billingSubscription.findFirst({
      where: { userId: user.id, provider: "paddle", status: "trialing" },
      orderBy: { updatedAt: "desc" },
      select: { trialEndsAt: true, nextPaymentAt: true },
    }),
  ]);
  if (!profile || !hasProAccess(profile)) {
    return <BillingResultCard icon={Clock3} tone="pending" eyebrow="Checkout complete" title="Activating your workspace" message="Paddle is confirming your plan. This normally takes only a few seconds."><PaymentStatusPoller /></BillingResultCard>;
  }
  const trialEnd = trial?.trialEndsAt ?? trial?.nextPaymentAt;
  if (trial && trialEnd) {
    const end = LONG_DATE.format(trialEnd);
    return <BillingResultCard icon={CircleCheck} tone="success" eyebrow="Pro trial started" title="Pro is unlocked for 7 days" message={`Your trial runs until ${end}. Your card is charged for your plan on ${end} unless you cancel before then from Account → Billing, where Pro stays until the trial ends and you are not charged.`}><Link href="/app" className="btn-primary w-full">Open dashboard <ArrowRight size={15} aria-hidden /></Link></BillingResultCard>;
  }
  return <BillingResultCard icon={CircleCheck} tone="success" eyebrow="Subscription active" title="Your workspace is ready" message="Your subscription is active and every Pro feature is unlocked."><Link href="/app" className="btn-primary w-full">Open dashboard <ArrowRight size={15} aria-hidden /></Link></BillingResultCard>;
}
