import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Features } from "@/components/Features";
import { MarketingPageHero } from "@/components/MarketingPageHero";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore ForexTestLab market replay, simulated execution, journaling, analytics, and strategy-review tools.",
  alternates: { canonical: "/features" },
};

const WORKSPACE_CAPABILITIES = [
  "Replay several chart timeframes from one synchronized session",
  "Plan entries with risk, reward, stop-loss, and take-profit levels",
  "Journal trades during replay and review them on an interactive chart",
  "Separate experimental trades from strategy performance analytics",
  "Save sessions and continue from the same market state later",
  "Review drawdown, expectancy, profit factor, streaks, and execution quality",
];

export default function FeaturesPage() {
  return (
    <PageShell>
      <MarketingPageHero
        eyebrow="Product features"
        title="A complete workspace for deliberate backtesting"
        description="Replay historical markets, simulate decisions, document your reasoning, and evaluate the result without switching between disconnected tools."
        secondary={{ label: "See how it works", href: "/how-it-works" }}
      />
      <Features />
      <section className="border-y border-white/10 bg-surface-900/40 py-16 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">One connected workflow</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">The chart, journal, and report share the same session.</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">Every simulated decision stays attached to its market context, making review faster and more reliable.</p>
          </div>
          <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {WORKSPACE_CAPABILITIES.map((item) => (
              <li key={item} className="flex gap-3 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">
                <Check size={17} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="container-page flex justify-end py-10">
        <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">View pricing <ArrowRight size={15} /></Link>
      </div>
    </PageShell>
  );
}
