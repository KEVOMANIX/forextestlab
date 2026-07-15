import type { Metadata } from "next";
import { Check } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { WaitlistForm } from "@/components/WaitlistForm";

export const metadata: Metadata = {
  title: "Join the Waitlist",
  description:
    "Register for early access to ForexTestLab, a forex backtesting and market-replay platform in development. No payment required.",
  alternates: { canonical: "/waitlist" },
};

const PERKS = [
  "Early invitation as the private beta opens",
  "Help prioritise the pairs and tools we build first",
  "Product updates as development progresses",
  "No payment required — unsubscribe any time",
];

export default function WaitlistPage() {
  return (
    <PageShell>
      <div className="container-page py-16 sm:py-20">
        <div className="mx-auto grid max-w-5xl items-start gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Early access</p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Join the ForexTestLab waitlist
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              ForexTestLab is still in development. Add your details to be
              notified as early access becomes available and to help shape what
              we build.
            </p>
            <ul className="mt-8 space-y-3">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-3 text-slate-300">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-400/15 text-brand-300">
                    <Check size={13} aria-hidden />
                  </span>
                  <span className="text-sm">{perk}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-xs leading-relaxed text-slate-500">
              ForexTestLab is an educational and analytical software platform in
              development. It does not provide financial advice or guarantee
              trading results.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface-800/50 p-6 shadow-card sm:p-8">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
