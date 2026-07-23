import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard } from "lucide-react";

import { BackLink } from "@/components/app/BackLink";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { SubscriptionRenewalControls } from "@/components/billing/SubscriptionRenewalControls";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing", robots: { index: false } };

function planName(value: string): string {
  const tier = value.split("_")[0];
  return tier ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : "Free";
}

export default async function BillingPage() {
  const user = await requireUser("/account/billing");
  await ensureUserProfile(user);
  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: user.id } });
  const subscription = await prisma.billingSubscription.findFirst({
    where: { userId: user.id, status: { in: ["active", "trialing", "past_due", "attention", "non-renewing"] } },
    orderBy: { updatedAt: "desc" },
  });
  const active = ["active", "attention", "non-renewing"].includes(profile.billingStatus) || Boolean(profile.proAccessUntil && profile.proAccessUntil > new Date());
  const paddleSubscription = subscription?.provider === "paddle"
    && ["active", "trialing"].includes(subscription.status)
    ? subscription
    : null;
  const nextPaymentLabel = subscription?.nextPaymentAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      }).format(subscription.nextPaymentAt)
    : null;

  return (
    <main id="main" className="min-h-[calc(100vh-3.5rem)] px-4 py-10 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <BackLink label="Back to account" fallback="/account" />
        <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Account billing</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Plan and subscription</h1><p className="mt-2 text-sm app-muted">Signed in as {user.email}</p></div>
        <section className="panel mt-8 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><CreditCard size={20} aria-hidden /></span>
              <div><p className="text-xs uppercase tracking-[0.14em] app-muted">Current plan</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">{active ? planName(profile.billingPlan) : "Free"}{active && <BadgeCheck size={18} className="text-brand-300" aria-hidden />}</h2><p className="mt-1 text-sm app-muted">{active ? "Your paid workspace is active." : "Choose a plan when you are ready for more capacity."}</p></div>
            </div>
            <div className="w-full sm:w-52">{subscription ? <ManageSubscriptionButton /> : <Link href="/pricing" className="btn-primary w-full">View plans <ArrowRight size={15} aria-hidden /></Link>}</div>
          </div>
          {paddleSubscription && (
            <div className="mt-6 border-t app-border pt-6">
              <SubscriptionRenewalControls
                autoRenew={!paddleSubscription.cancelAtPeriodEnd}
                nextPaymentLabel={nextPaymentLabel}
              />
              <p className="mt-3 text-xs app-muted">
                Paddle securely handles invoices, payment methods, and billing history.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
