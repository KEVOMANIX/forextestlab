import type { Metadata } from "next";
import { BadgeCheck, CreditCard } from "lucide-react";

import { BackLink } from "@/components/app/BackLink";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { SubscriptionRenewalControls } from "@/components/billing/SubscriptionRenewalControls";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing/availability";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { formatQuotaReset } from "@/lib/billing/plan-limits";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing", robots: { index: false } };

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function BillingPage() {
  const checkoutEnabled = billingEnabled();
  const user = await requireUser("/account/billing");
  const [entitlements, subscription] = await Promise.all([
    ensureUserProfile(user).then(() => getUserEntitlements(user.id)),
    prisma.billingSubscription.findFirst({
      where: { userId: user.id, status: { in: ["active", "trialing", "past_due", "attention", "non-renewing"] } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const pro = entitlements.plan === "pro";
  const trial = subscription?.provider === "paddle" && subscription.status === "trialing";
  const paddleSubscription = subscription?.provider === "paddle"
    && ["active", "trialing"].includes(subscription.status)
    ? subscription
    : null;
  const manageableSubscription = subscription
    && (subscription.provider !== "paddle" || subscription.productKey.startsWith("pro_"));
  // During a trial the next charge is the trial's end.
  const nextDate = trial ? subscription?.trialEndsAt ?? subscription?.nextPaymentAt : subscription?.nextPaymentAt;
  const nextPaymentLabel = nextDate ? LONG_DATE.format(nextDate) : null;
  const monthly = entitlements.monthlySessions;

  const heading = !checkoutEnabled ? "Early access" : trial ? "Pro trial" : pro ? "Pro" : "Free";
  const summary = !checkoutEnabled
    ? "Full workspace access is free while billing is paused."
    : trial
      ? `Every Pro feature is unlocked until ${nextPaymentLabel ?? "your trial ends"}.`
      : pro
        ? "Every market, the full history, multi-pair replay, full analytics and Prop Firm Challenge mode."
        : monthly
          ? `${monthly.remaining} of ${monthly.limit} new sessions left this month; more arrive on ${formatQuotaReset(monthly.resetsAt)}.`
          : "Choose a plan when you are ready for more.";

  return (
    <main id="main" className="min-h-[calc(100dvh-3.5rem)] px-4 py-10 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <BackLink label="Back to account" fallback="/account" />
        <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Account billing</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Plan and subscription</h1><p className="mt-2 text-sm app-muted">Signed in as {user.email}</p></div>
        <section className="panel mt-8 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><CreditCard size={20} aria-hidden /></span>
              <div><p className="text-xs uppercase tracking-[0.14em] app-muted">Current plan</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">{heading}{(pro || !checkoutEnabled) && <BadgeCheck size={18} className="text-brand-300" aria-hidden />}</h2><p className="mt-1 text-sm app-muted">{summary}</p></div>
            </div>
            {checkoutEnabled
              ? <div className="w-full sm:w-52">{manageableSubscription ? <ManageSubscriptionButton /> : <a href="/pricing" className="btn-primary w-full">View plans</a>}</div>
              : manageableSubscription ? <div className="w-full sm:w-52"><ManageSubscriptionButton /></div> : <span className="rounded-lg border border-brand-400/20 bg-brand-400/[.07] px-3 py-2 text-center text-xs font-semibold text-brand-200">Billing paused</span>}
          </div>
          {!checkoutEnabled && <p className="mt-5 border-t app-border pt-5 text-xs app-muted">New purchases are disabled. Existing subscribers can still manage or turn off renewal below.</p>}
          {paddleSubscription && (
            <div className="mt-6 border-t app-border pt-6">
              <SubscriptionRenewalControls
                autoRenew={!paddleSubscription.cancelAtPeriodEnd}
                nextPaymentLabel={nextPaymentLabel}
                trial={trial}
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
