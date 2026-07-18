import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard, Smartphone, WalletCards } from "lucide-react";

import { PricingCards } from "@/components/billing/PricingCards";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Compare ForexTestLab Free and Pro plans for historical market replay, backtesting analytics, and trading review.",
  alternates: { canonical: "/pricing" },
};

const comparison = [
  ["Saved sessions", "3", "Unlimited"],
  ["Pairs per session", "1", "Multiple"],
  ["Replay and simulated orders", "Included", "Included"],
  ["Session summary", "Included", "Included"],
  ["Risk and timing analytics", "—", "Included"],
  ["MAE / MFE analysis", "—", "Included"],
  ["CSV trade exports", "—", "Included"],
] as const;

export default function PricingPage() {
  return (
    <PageShell>
      <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24">
        <div aria-hidden className="absolute left-1/2 top-0 h-72 w-[52rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="container-page relative text-center">
          <p className="eyebrow">Simple KES pricing</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
            A serious testing workspace without a complicated price structure.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-slate-400">
            Begin with the complete replay workflow, then unlock deeper analytics and an unrestricted testing record with Pro.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="container-page">
          <PricingCards />

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="card p-5"><WalletCards size={20} className="text-brand-300" aria-hidden /><h2 className="mt-3 font-semibold text-white">Kenya-shilling pricing</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Every paid plan is clearly priced and charged in KES.</p></div>
            <div className="card p-5"><CreditCard size={20} className="text-brand-300" aria-hidden /><h2 className="mt-3 font-semibold text-white">Secure checkout</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Payments are processed by Paystack; ForexTestLab does not collect card details.</p></div>
            <div className="card p-5"><Smartphone size={20} className="text-brand-300" aria-hidden /><h2 className="mt-3 font-semibold text-white">M-PESA access pass</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Prefer mobile money? Choose the renewable 30-day Pro pass.</p></div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-surface-900/55 py-16 sm:py-20">
        <div className="container-page max-w-4xl">
          <div className="text-center"><p className="eyebrow">Plan comparison</p><h2 className="mt-4 text-3xl font-bold tracking-tight text-white">Choose based on how you test</h2></div>
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-surface-800/60">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">ForexTestLab plan comparison</caption>
              <thead><tr className="border-b border-white/10 text-slate-400"><th className="px-4 py-4 font-medium sm:px-6">Feature</th><th className="px-4 py-4 text-center font-medium">Free</th><th className="px-4 py-4 text-center font-medium text-brand-300 sm:px-6">Pro</th></tr></thead>
              <tbody>{comparison.map(([feature,free,pro])=><tr key={feature} className="border-b border-white/5 last:border-0"><th scope="row" className="px-4 py-4 font-medium text-slate-300 sm:px-6">{feature}</th><td className="px-4 py-4 text-center text-slate-500">{free}</td><td className="px-4 py-4 text-center font-medium text-slate-200 sm:px-6">{pro === "Included" && <BadgeCheck size={16} className="mr-1 inline text-brand-300" aria-hidden />}{pro}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-10 text-center"><Link href="/sign-up" className="btn-primary">Create a free account <ArrowRight size={16} aria-hidden /></Link><p className="mt-3 text-xs text-slate-500">No card required for the Free plan.</p></div>
        </div>
      </section>
    </PageShell>
  );
}
