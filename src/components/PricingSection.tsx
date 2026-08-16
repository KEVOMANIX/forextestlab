import Link from "next/link";
import { ArrowRight, CreditCard, Globe2, ShieldCheck } from "lucide-react";

import { LocalizedPricing } from "@/components/billing/LocalizedPricing";
import { Section } from "@/components/Section";
import { paddleBrowserEnvironment, requiredPaddleClientToken } from "@/lib/billing/paddle";
import { getPricingTiers } from "@/lib/billing/tiers";
import { TrialOffer } from "@/components/TrialOffer";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export function PricingSection() {
  return (
    <Section
      id="pricing"
      eyebrow="Simple pricing"
      title="Choose a plan that grows with your testing."
      description="Country-localized monthly and yearly totals with secure Paddle checkout."
      className="bg-surface-900/45"
      centered
    >
      <div className="mb-8 text-left">
        <TrialOffer
          compact
          href={TRIAL_SIGN_UP_PATH}
        />
      </div>
      <LocalizedPricing
        compact
        showOffer={false}
        tiers={getPricingTiers()}
        clientToken={requiredPaddleClientToken()}
        environment={paddleBrowserEnvironment()}
      />
      <div className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-surface-900/70 p-4 text-sm text-slate-400 sm:grid-cols-3 sm:p-5">
        <span className="flex items-center gap-2"><Globe2 size={16} className="text-brand-300" aria-hidden /> Country-localized totals</span>
        <span className="flex items-center gap-2"><CreditCard size={16} className="text-brand-300" aria-hidden /> Secure checkout via Paddle</span>
        <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-brand-300" aria-hidden /> Account-based billing controls</span>
      </div>
      <div className="mt-6 text-center">
        <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">Compare all plan details <ArrowRight size={15} aria-hidden /></Link>
      </div>
    </Section>
  );
}
