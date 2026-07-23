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
      <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24">
        <div aria-hidden className="absolute left-1/2 top-0 h-72 w-[52rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="container-page relative text-center">
          <p className="eyebrow">Plans that scale with your process</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">Choose the workspace that matches how seriously you test.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-slate-400">Prices are localized for your country and the total shown is the total Paddle carries into checkout.</p>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="mb-10">
            <TrialOffer
              href={user ? "/app/backtest" : "/sign-up?next=%2Fapp%2Fbacktest"}
            />
          </div>
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
