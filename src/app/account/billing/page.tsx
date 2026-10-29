import type { Metadata } from "next";
import { ArrowRight, Crown } from "lucide-react";

import { AccountShell, loadAccount } from "@/components/account/AccountShell";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { SubscriptionRenewalControls } from "@/components/billing/SubscriptionRenewalControls";
import { billingEnabled } from "@/lib/billing/availability";
import { formatQuotaReset } from "@/lib/billing/plan-limits";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing", robots: { index: false } };

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function BillingPage() {
  const checkoutEnabled = billingEnabled();
  const account = await loadAccount("/account/billing");
  const subscription = await prisma.billingSubscription.findFirst({
    where: { userId: account.user.id, status: { in: ["active", "trialing", "past_due", "attention", "non-renewing"] } },
    orderBy: { updatedAt: "desc" },
  });
  const { pro, entitlements } = account;
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
      : account.note;

  return (
    <AccountShell account={account} tab="billing">
      <section className={`overflow-hidden rounded-xl border ${pro ? "border-amber-300/30 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(20,184,166,0.05))]" : "app-border bg-[var(--app-panel)]"}`}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${pro ? "text-amber-200" : "app-muted"}`}>Current plan</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold">
              {pro && <Crown size={20} className="text-amber-200" aria-hidden />}{heading}
            </h2>
            <p className="mt-1 text-sm app-muted">{summary}</p>
          </div>
          {checkoutEnabled
            ? <div className="w-full sm:w-52">{manageableSubscription ? <ManageSubscriptionButton /> : !pro ? <a href="/pricing" className="btn-primary w-full">Upgrade to Pro <ArrowRight size={15} aria-hidden /></a> : null}</div>
            : manageableSubscription ? <div className="w-full sm:w-52"><ManageSubscriptionButton /></div> : <span className="rounded-lg border border-brand-400/20 bg-brand-400/[.07] px-3 py-2 text-center text-xs font-semibold text-brand-200">Billing paused</span>}
        </div>

        {!pro && monthly && (
          <div className="border-t app-border px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between text-xs">
              <span className="app-muted">Sessions this month</span>
              <span className="font-semibold tabular-nums">{monthly.used} / {monthly.limit}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--app-panel-2)]">
              <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, monthly.used / monthly.limit * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs app-muted">{monthly.remaining} left · more arrive on {formatQuotaReset(monthly.resetsAt)}.</p>
          </div>
        )}

        {!checkoutEnabled && <p className="border-t app-border px-5 py-4 text-xs app-muted sm:px-6">New purchases are disabled. Existing subscribers can still manage or turn off renewal below.</p>}
        {paddleSubscription && (
          <div className="border-t app-border px-5 py-5 sm:px-6">
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
    </AccountShell>
  );
}
