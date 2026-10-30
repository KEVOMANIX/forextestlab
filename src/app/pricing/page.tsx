import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { LocalizedPricing } from "@/components/billing/LocalizedPricing";
import { PageShell } from "@/components/PageShell";
import { billingEnabled } from "@/lib/billing/availability";
import { proTrialEligible } from "@/lib/billing/checkout";
import { paddleBrowserEnvironment, requiredPaddleClientToken } from "@/lib/billing/paddle";
import { FREE_PLAN_FEATURES, PRO_PLAN_FEATURES } from "@/lib/billing/plan-copy";
import { getPricingTiers, proTrialPricesConfigured } from "@/lib/billing/tiers";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free for the major pairs every month; Pro for every market, the full history, multi-pair replay, full analytics and Prop Firm Challenge mode.",
  alternates: { canonical: "/pricing" },
};

export const dynamic = "force-dynamic";

function FeatureList({ features }: { features: readonly string[] }) {
  return (
    <ul className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm text-slate-300">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-3">
          <Check size={16} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

/** While billing is switched off, every account has the full workspace. */
function EarlyAccessPricing() {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
      <article className="flex min-h-[30rem] flex-col rounded-2xl border border-white/10 bg-surface-900/70 p-7 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Free</h2>
          <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-200">Ongoing</span>
        </div>
        <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">Backtest the major pairs every month, with no card required.</p>
        <div className="mt-7 flex items-end gap-2">
          <strong className="text-4xl font-bold tracking-tight text-white">$0</strong>
        </div>
        <FeatureList features={FREE_PLAN_FEATURES} />
        <Link href="/sign-up" className="btn-secondary mt-auto w-full py-3">
          Create a free account <ArrowRight size={16} aria-hidden />
        </Link>
      </article>

      <article className="relative flex min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-brand-400/40 bg-surface-900 p-7 shadow-card">
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300 to-transparent" />
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Pro</h2>
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">Included in early access</span>
        </div>
        <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">
          During early access every account has the full Pro workspace at no charge. Monthly and yearly plans, with a 7-day free trial, will be announced before any payment is taken.
        </p>
        <div className="mt-7">
          <strong className="text-2xl font-bold tracking-tight text-white">Free during early access</strong>
        </div>
        <FeatureList features={PRO_PLAN_FEATURES} />
        <Link href="/sign-up" className="btn-primary mt-auto w-full py-3">
          Get early access <ArrowRight size={16} aria-hidden />
        </Link>
      </article>
    </div>
  );
}

export default async function PricingPage() {
  const checkoutEnabled = billingEnabled();
  const user = checkoutEnabled ? await getCurrentUser() : null;
  // Signed out, any new account can take the trial; signed in, the server's
  // eligibility rule decides (and decides again at checkout).
  const trialOffer = checkoutEnabled && (user ? await proTrialEligible(user.id) : proTrialPricesConfigured());

  return (
    <PageShell>
      <main className="border-b border-white/10">
        <section className="container-page pb-4 pt-5 text-center sm:pt-6">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Plans</p>
          <h1 className="mx-auto max-w-3xl text-balance text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl">
            Make your next move.
          </h1>
        </section>

        <section className="container-page pb-8 sm:pb-10">
          {checkoutEnabled ? (
            <LocalizedPricing
              tiers={getPricingTiers()}
              clientToken={requiredPaddleClientToken()}
              environment={paddleBrowserEnvironment()}
              customerEmail={user?.email ?? undefined}
              userId={user?.id}
              trialOffer={trialOffer}
              trialAvailable={proTrialPricesConfigured()}
            />
          ) : (
            <EarlyAccessPricing />
          )}
        </section>
      </main>
    </PageShell>
  );
}
