import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LocalizedPricing } from "@/components/billing/LocalizedPricing";
import { PreLaunchAccessCard } from "@/components/billing/PreLaunchAccessCard";
import { Section } from "@/components/Section";
import { billingEnabled } from "@/lib/billing/availability";
import { paddleBrowserEnvironment, requiredPaddleClientToken } from "@/lib/billing/paddle";
import { getPricingTiers } from "@/lib/billing/tiers";
import { TrialOffer } from "@/components/TrialOffer";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export function PricingSection() {
  const checkoutEnabled = billingEnabled();
  return (
    <Section
      id="pricing"
      eyebrow={checkoutEnabled ? "Simple pricing" : "Early access"}
      title={checkoutEnabled ? "Choose a plan that grows with your testing." : "Explore the full workspace, free for now."}
      description={checkoutEnabled ? "Country-localized monthly and yearly totals with secure Paddle checkout." : "We are refining ForexTestLab before launch, so payment is not required."}
      className="bg-surface-900/45"
      centered
    >
      {checkoutEnabled ? <>
        <div className="mb-8 text-left"><TrialOffer compact href={TRIAL_SIGN_UP_PATH} /></div>
        <LocalizedPricing compact showOffer={false} tiers={getPricingTiers()} clientToken={requiredPaddleClientToken()} environment={paddleBrowserEnvironment()} />
        <div className="mt-6 text-center"><Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">Compare all plan details <ArrowRight size={15} aria-hidden /></Link></div>
      </> : <PreLaunchAccessCard compact />}
    </Section>
  );
}
