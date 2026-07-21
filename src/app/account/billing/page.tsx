import type { Metadata } from "next";
import Link from "next/link";
import { Check, CreditCard, LockKeyhole } from "lucide-react";

import { BackLink } from "@/components/app/BackLink";
import { BillingCheckoutButton } from "@/components/billing/BillingCheckoutButton";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import {
  annualSavingPercent,
  checkoutProductReady,
  formatPlanPrice,
  getBillingCatalog,
  type PaidPlanKey,
} from "@/lib/billing/catalog";
import { paddleMode } from "@/lib/billing/paddle";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing", robots: { index: false } };

export default async function BillingPage({ searchParams }: { searchParams: { plan?: string } }) {
  const user = await requireUser(`/account/billing${searchParams.plan ? `?plan=${encodeURIComponent(searchParams.plan)}` : ""}`);
  await ensureUserProfile(user);
  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: user.id } });
  const subscription = await prisma.billingSubscription.findFirst({
    where: { userId: user.id, status: { in: ["active", "trialing", "past_due", "attention", "non-renewing"] } },
    orderBy: { updatedAt: "desc" },
  });
  const hasPro = ["active", "attention", "non-renewing"].includes(profile.billingStatus) || Boolean(profile.proAccessUntil && profile.proAccessUntil > new Date());
  const plans = getBillingCatalog().filter((plan) => plan.key !== "free");
  const selectedKey: PaidPlanKey = searchParams.plan === "pro_annual_usd" ? "pro_annual_usd" : "pro_monthly_usd";
  const selected = plans.find((plan) => plan.key === selectedKey)!;
  const monthly = plans.find((plan) => plan.key === "pro_monthly_usd")!;
  const annual = plans.find((plan) => plan.key === "pro_annual_usd")!;
  const saving = annualSavingPercent(monthly.amount, annual.amount);

  return (
    <main id="main" className="app-shell min-h-screen px-4 py-10 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <BackLink label="Back to account" fallback="/account" />
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Account billing</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Choose your Pro plan</h1><p className="mt-2 text-sm app-muted">Signed in as {user.email}</p></div>
          <span className="w-fit rounded-full border app-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold app-muted">Current plan · {hasPro ? "Pro" : "Free"}</span>
        </div>
        {paddleMode() === "sandbox" && <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"><strong>Paddle Sandbox</strong> · No real money will be charged.</div>}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {plans.map((plan) => {
            const active = plan.key === selectedKey;
            return <Link key={plan.key} href={`/account/billing?plan=${plan.key}`} aria-current={active ? "true" : undefined} className={`relative rounded-2xl border p-5 transition-colors ${active ? "border-brand-400/60 bg-brand-400/[0.08]" : "app-border bg-[var(--app-panel)] hover:border-brand-400/30"}`}><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{plan.name}</p><p className="mt-2"><strong className="font-mono text-2xl">{formatPlanPrice(plan.amount, plan.currency)}</strong><span className="ml-1 text-xs app-muted">/ {plan.interval}</span></p></div><span className={`grid h-6 w-6 place-items-center rounded-full border ${active ? "border-brand-400 bg-brand-500 text-surface-950" : "app-border"}`}>{active && <Check size={14} aria-hidden />}</span></div>{plan.key === "pro_annual_usd" && saving > 0 && <p className="mt-3 text-xs font-semibold text-brand-300">Save {saving}% compared with monthly</p>}<p className="mt-3 text-xs app-muted">{plan.description}</p></Link>;
          })}
        </div>

        <section className="panel mt-6 overflow-hidden">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_280px]">
            <div><div className="flex items-center gap-2"><CreditCard size={18} className="text-brand-300" aria-hidden /><h2 className="font-semibold">International Pro subscription</h2></div><ul className="mt-4 grid gap-2 text-sm app-muted sm:grid-cols-2">{selected.features.slice(0, 4).map((feature) => <li key={feature} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />{feature}</li>)}</ul><div className="mt-5 flex items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 text-xs app-muted"><LockKeyhole size={14} aria-hidden />Paddle securely handles payment details, taxes, and receipts.</div></div>
            <aside className="rounded-xl border app-border bg-[var(--app-panel-2)] p-4"><div className="flex items-center justify-between text-sm"><span className="app-muted">Due today</span><strong className="font-mono text-lg">{formatPlanPrice(selected.amount, selected.currency)}</strong></div><div className="mt-3 flex items-center justify-between border-t app-border pt-3 text-xs"><span className="app-muted">Renewal</span><span className="capitalize">Every {selected.interval}</span></div>{subscription ? <div className="mt-5"><ManageSubscriptionButton /></div> : <BillingCheckoutButton productKey={selectedKey} ready={checkoutProductReady(selectedKey)} />}</aside>
          </div>
        </section>
      </div>
    </main>
  );
}
