import Link from "next/link";
import { ArrowRight, CreditCard, Globe2, ShieldCheck } from "lucide-react";

import { PricingCards } from "@/components/billing/PricingCards";
import { Section } from "@/components/Section";

export function PricingSection() {
  return (
    <Section
      id="pricing"
      eyebrow="Simple pricing"
      title="Start free. Upgrade when your testing gets serious."
      description="International USD billing with secure card checkout. No trading commissions, deposits, or hidden platform fees."
      className="bg-surface-900/45"
      centered
    >
      <PricingCards compact />
      <div className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-surface-900/70 p-4 text-sm text-slate-400 sm:grid-cols-3 sm:p-5">
        <span className="flex items-center gap-2"><Globe2 size={16} className="text-brand-300" aria-hidden /> USD international billing</span>
        <span className="flex items-center gap-2"><CreditCard size={16} className="text-brand-300" aria-hidden /> Card subscriptions via Paystack</span>
        <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-brand-300" aria-hidden /> Account-based billing controls</span>
      </div>
      <div className="mt-6 text-center">
        <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">
          Compare all plan details <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </Section>
  );
}
