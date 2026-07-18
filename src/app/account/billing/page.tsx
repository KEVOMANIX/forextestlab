import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronRight, CreditCard, LockKeyhole, Smartphone } from "lucide-react";

import { BackLink } from "@/components/app/BackLink";
import { requireUser } from "@/lib/auth";
import {
  annualSavingPercent,
  formatPlanPrice,
  getBillingCatalog,
  type PaidPlanKey,
} from "@/lib/billing/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing", robots: { index: false } };

export default async function BillingPage({ searchParams }: { searchParams: { plan?: string } }) {
  const user = await requireUser(`/account/billing${searchParams.plan ? `?plan=${encodeURIComponent(searchParams.plan)}` : ""}`);
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
        <span className="w-fit rounded-full border app-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold app-muted">Current plan · Free</span>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const active=plan.key===selectedKey;
          return <Link key={plan.key} href={`/account/billing?plan=${plan.key}`} aria-current={active?"true":undefined} className={`relative rounded-2xl border p-5 transition-colors ${active?"border-brand-400/60 bg-brand-400/[0.08]":"app-border bg-[var(--app-panel)] hover:border-brand-400/30"}`}><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{plan.name}</p><p className="mt-2"><strong className="font-mono text-2xl">{formatPlanPrice(plan.amount,plan.currency)}</strong><span className="ml-1 text-xs app-muted">/ {plan.interval}</span></p></div><span className={`grid h-6 w-6 place-items-center rounded-full border ${active?"border-brand-400 bg-brand-500 text-surface-950":"app-border"}`}>{active&&<Check size={14} aria-hidden/>}</span></div>{plan.key==="pro_annual_usd"&&saving>0&&<p className="mt-3 text-xs font-semibold text-brand-300">Save {saving}% compared with monthly</p>}<p className="mt-3 text-xs app-muted">{plan.description}</p></Link>;
        })}
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_280px]">
          <div><div className="flex items-center gap-2"><CreditCard size={18} className="text-brand-300" aria-hidden/><h2 className="font-semibold">International card subscription</h2></div><ul className="mt-4 grid gap-2 text-sm app-muted sm:grid-cols-2">{selected.features.slice(0,4).map(feature=><li key={feature} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-brand-300" aria-hidden/>{feature}</li>)}</ul><div className="mt-5 flex items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 text-xs app-muted"><LockKeyhole size={14} aria-hidden/>Card details will be handled on Paystack&apos;s secure checkout.</div></div>
          <aside className="rounded-xl border app-border bg-[var(--app-panel-2)] p-4"><div className="flex items-center justify-between text-sm"><span className="app-muted">Due today</span><strong className="font-mono text-lg">{formatPlanPrice(selected.amount,selected.currency)}</strong></div><div className="mt-3 flex items-center justify-between border-t app-border pt-3 text-xs"><span className="app-muted">Renewal</span><span className="capitalize">Every {selected.interval}</span></div><button type="button" disabled className="btn-primary mt-5 w-full">Checkout opening soon <ChevronRight size={15} aria-hidden/></button><p className="mt-3 text-center text-[10px] leading-relaxed app-muted">Checkout activates after the Paystack merchant account and plan codes are approved.</p></aside>
        </div>
      </section>

      <section className="panel mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><Smartphone size={18} aria-hidden/></span><div><h2 className="text-sm font-semibold">Paying from Kenya?</h2><p className="mt-1 text-xs app-muted">A renewable 30-day M-PESA access pass will be available in KES.</p></div></div><span className="rounded-full border app-border px-3 py-1.5 text-xs app-muted">Coming with checkout</span></section>
      </div>
    </main>
  );
}
