import type { Metadata } from "next";
import { headers } from "next/headers";
import { CreditCard, Globe2, ReceiptText } from "lucide-react";

import { LocalizedPricing } from "@/components/billing/LocalizedPricing";
import { PageShell } from "@/components/PageShell";
import { paddleBrowserEnvironment, requiredPaddleClientToken } from "@/lib/billing/paddle";
import { getPricingTiers } from "@/lib/billing/tiers";
import { countryCodeFromHeaders } from "@/lib/request-country";
import { getCurrentUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { TrialOffer } from "@/components/TrialOffer";
import { TRIAL_SIGN_UP_PATH, TRIAL_START_PATH } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Choose a ForexTestLab plan with localized monthly or yearly pricing and secure Paddle checkout.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const requestHeaders = headers();
  const countryCode = countryCodeFromHeaders(requestHeaders);
  const user = await getCurrentUser();
  const profile = user ? await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { paddleCustomerId: true },
  }) : null;
  const tiers = getPricingTiers();
  const clientToken = requiredPaddleClientToken();
  const environment = paddleBrowserEnvironment();

  return (
    <PageShell>
      <section className="relative overflow-hidden border-b border-white/10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(34,195,160,.12),transparent_32%),radial-gradient(circle_at_85%_72%,rgba(59,107,255,.09),transparent_28%)]" />
        <div className="container-page relative py-14 sm:py-20 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1.12fr_.88fr] lg:gap-16">
            <div>
              <p className="eyebrow w-fit">Simple plans. Serious testing.</p>
              <h1 className="mt-6 max-w-3xl text-balance text-5xl font-bold leading-[.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4.5rem]">
                Build confidence.<br />
                <span className="bg-gradient-to-r from-brand-200 via-cyan-300 to-accent-400 bg-clip-text text-transparent">
                  Trade with evidence.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">
                Replay real market history, test your process, and choose the workspace that fits the depth of your research.
              </p>
              <p className="mt-7 flex items-center gap-2 text-sm text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden />
                Localized pricing appears below
              </p>
            </div>
            <TrialOffer
              variant="hero"
              href={user ? TRIAL_START_PATH : TRIAL_SIGN_UP_PATH}
            />
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page">
          <LocalizedPricing tiers={tiers} countryCode={countryCode} customerEmail={user?.email} paddleCustomerId={profile?.paddleCustomerId ?? undefined} userId={user?.id} clientToken={clientToken} environment={environment} />
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="card p-5"><Globe2 size={20} className="text-brand-300" aria-hidden /><h2 className="mt-3 font-semibold text-white">Localized totals</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Paddle detects your market and returns the formatted total shown above.</p></div>
            <div className="card p-5"><CreditCard size={20} className="text-brand-300" aria-hidden /><h2 className="mt-3 font-semibold text-white">Secure overlay checkout</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Payment details stay inside Paddle&apos;s one-page checkout.</p></div>
            <div className="card p-5"><ReceiptText size={20} className="text-brand-300" aria-hidden /><h2 className="mt-3 font-semibold text-white">Taxes and receipts</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Paddle acts as merchant of record and handles applicable taxes and receipts.</p></div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
