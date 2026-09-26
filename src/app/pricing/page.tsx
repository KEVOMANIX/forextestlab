import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Clock3 } from "lucide-react";

import { LocalizedPricing } from "@/components/billing/LocalizedPricing";
import { PageShell } from "@/components/PageShell";
import { billingEnabled } from "@/lib/billing/availability";
import { paddleBrowserEnvironment, requiredPaddleClientToken } from "@/lib/billing/paddle";
import { getPricingTiers } from "@/lib/billing/tiers";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Compare ForexTestLab plans for market replay, journaling, and trading analytics.",
  alternates: { canonical: "/pricing" },
};

const freeFeatures = [
  "Three backtesting sessions",
  "One month of market data per session",
  "Trading journal",
  "Core performance analytics",
];

const proFeatures = [
  "Unlimited saved sessions",
  "Multi-pair backtests",
  "Complete risk and timing analytics",
  "Trade and analytics exports",
  "All replay speeds and controls",
];

function FeatureList({ features }: { features: string[] }) {
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

function UpcomingPricing() {
  return (
    <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
      <article className="flex min-h-[30rem] flex-col rounded-2xl border border-white/10 bg-surface-900/70 p-7 shadow-card sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Free</h2>
          <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-200">Available now</span>
        </div>
        <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">Start testing your process with the core replay workspace.</p>
        <div className="mt-7 flex items-end gap-2">
          <strong className="text-4xl font-bold tracking-tight text-white">$0</strong>
          <span className="pb-1 text-sm text-slate-500">during early access</span>
        </div>
        <FeatureList features={freeFeatures} />
        <Link href="/sign-up" className="btn-secondary mt-auto w-full py-3">
          Start free <ArrowRight size={16} aria-hidden />
        </Link>
      </article>

      <article className="relative flex min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-brand-400/35 bg-surface-900 p-7 shadow-card sm:p-8">
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300 to-transparent" />
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Pro</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">
            <Clock3 size={12} aria-hidden /> Upcoming
          </span>
        </div>
        <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">For traders who want deeper testing, analysis, and exports.</p>
        <div className="mt-7">
          <strong className="text-2xl font-bold tracking-tight text-white">Pricing coming soon</strong>
          <p className="mt-1 text-sm text-slate-500">Monthly and yearly plans</p>
        </div>
        <FeatureList features={proFeatures} />
        <div aria-disabled="true" className="mt-auto inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-500">
          Pro plan upcoming
        </div>
      </article>
    </div>
  );
}

export default function PricingPage() {
  const checkoutEnabled = billingEnabled();

  return (
    <PageShell>
      <main className="border-b border-white/10">
        <section className="container-page py-14 text-center sm:py-16">
          <p className="eyebrow mx-auto w-fit">Pricing</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold tracking-[-0.035em] text-white sm:text-5xl">
            Plans for every stage of your testing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-slate-400">
            Start free today. Pro plans are being prepared for launch.
          </p>
        </section>

        <section className="container-page pb-20 sm:pb-24">
          {checkoutEnabled ? (
            <LocalizedPricing tiers={getPricingTiers()} clientToken={requiredPaddleClientToken()} environment={paddleBrowserEnvironment()} />
          ) : (
            <UpcomingPricing />
          )}
        </section>
      </main>
    </PageShell>
  );
}
