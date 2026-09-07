import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { LocalizedPricing } from "@/components/billing/LocalizedPricing";
import { PreLaunchAccessCard } from "@/components/billing/PreLaunchAccessCard";
import { PageShell } from "@/components/PageShell";
import { billingEnabled } from "@/lib/billing/availability";
import { paddleBrowserEnvironment, requiredPaddleClientToken } from "@/lib/billing/paddle";
import { getPricingTiers } from "@/lib/billing/tiers";
import { TrialOffer } from "@/components/TrialOffer";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Choose a ForexTestLab plan with localized monthly or yearly pricing and secure Paddle checkout.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const checkoutEnabled = billingEnabled();

  return (
    <PageShell>
      <section className="relative overflow-hidden border-b border-white/10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(34,195,160,.12),transparent_32%),radial-gradient(circle_at_85%_72%,rgba(59,107,255,.09),transparent_28%)]" />
        <div className="container-page relative py-14 sm:py-20 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1.12fr_.88fr] lg:gap-16">
            <div>
              <p className="eyebrow w-fit">{checkoutEnabled ? "Simple plans. Serious testing." : "Early access is open"}</p>
              <h1 className="mt-6 max-w-3xl text-balance text-5xl font-bold leading-[.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4.5rem]">
                {checkoutEnabled ? <>Build confidence.<br /><span className="bg-gradient-to-r from-brand-200 via-cyan-300 to-accent-400 bg-clip-text text-transparent">Trade with evidence.</span></> : <>Build confidence.<br /><span className="bg-gradient-to-r from-brand-200 via-cyan-300 to-accent-400 bg-clip-text text-transparent">No payment required.</span></>}
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">
                {checkoutEnabled ? "Replay real market history, test your process, and choose the workspace that fits the depth of your research." : "Use ForexTestLab freely while we refine the experience for launch."}
              </p>
              {checkoutEnabled && <p className="mt-7 flex items-center gap-2 text-sm text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden />
                Localized pricing appears below
              </p>}
            </div>
            {checkoutEnabled && <TrialOffer variant="hero" href={TRIAL_SIGN_UP_PATH} />}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page">
          {checkoutEnabled ? <LocalizedPricing tiers={getPricingTiers()} clientToken={requiredPaddleClientToken()} environment={paddleBrowserEnvironment()} /> : <PreLaunchAccessCard />}
          {!checkoutEnabled && <div className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-2 text-sm text-slate-300"><CheckCircle2 size={17} className="text-brand-300" aria-hidden /> Your access will remain free until billing is formally launched.</div>}
        </div>
      </section>
    </PageShell>
  );
}
