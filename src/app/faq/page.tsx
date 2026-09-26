import type { Metadata } from "next";
import Link from "next/link";

import { FAQ } from "@/components/FAQ";
import { MarketingPageHero } from "@/components/MarketingPageHero";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Answers about ForexTestLab data, replay, simulated trading, trials, billing, and account access.",
  alternates: { canonical: "/faq" },
};

export default function FAQPage() {
  return (
    <PageShell>
      <MarketingPageHero
        eyebrow="Help center"
        title="Questions about ForexTestLab"
        description="Find clear answers about historical replay, simulated execution, accounts, and product access."
        secondary={{ label: "Contact support", href: "/support" }}
      />
      <FAQ />
      <section className="border-t border-white/10 py-14">
        <div className="container-page flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div><h2 className="text-xl font-semibold text-white">Still need help?</h2><p className="mt-1 text-sm text-slate-400">Send us the question or problem and include the affected session when relevant.</p></div>
          <Link href="/contact" className="btn-secondary shrink-0">Contact us</Link>
        </div>
      </section>
    </PageShell>
  );
}
