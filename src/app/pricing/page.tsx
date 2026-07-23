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
      <section className="relative overflow-hidden border-b border-white/10 py-12 sm:py-16 lg:py-20">
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,rgba(34,195,160,.07),transparent_42%,rgba(59,107,255,.07))]" />
        <div aria-hidden className="absolute -left-32 top-4 h-80 w-80 rounded-full bg-brand-400/10 blur-3xl" />
        <div aria-hidden className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="container-page relative">
          <div className="grid overflow-hidden rounded-[2rem] border border-white/10 bg-surface-900/60 p-5 shadow-[0_35px_100px_-55px_rgba(34,195,160,.7)] backdrop-blur sm:p-7 lg:grid-cols-[1.02fr_.98fr] lg:gap-8 lg:p-8">
            <div className="flex flex-col justify-center px-1 py-4 sm:px-3 lg:py-6">
              <p className="eyebrow w-fit">Plans that scale with your process</p>
              <h1 className="mt-6 max-w-2xl text-balance text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.6rem]">
                Choose a plan built for the way you test.
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
                Start free, then move into a workspace sized for your replay volume and research process.
              </p>
              <dl className="mt-8 grid grid-cols-3 gap-2 border-t border-white/10 pt-6">
                <div><dt className="text-lg font-bold text-white sm:text-xl">3 tiers</dt><dd className="mt-1 text-[11px] text-slate-500 sm:text-xs">Starter to Advanced</dd></div>
                <div><dt className="text-lg font-bold text-white sm:text-xl">2 options</dt><dd className="mt-1 text-[11px] text-slate-500 sm:text-xs">Monthly or yearly</dd></div>
                <div><dt className="text-lg font-bold text-white sm:text-xl">Global</dt><dd className="mt-1 text-[11px] text-slate-500 sm:text-xs">Localized totals</dd></div>
              </dl>
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
