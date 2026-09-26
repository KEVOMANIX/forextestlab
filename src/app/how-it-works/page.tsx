import type { Metadata } from "next";
import { BarChart3, CandlestickChart, NotebookPen, Play, type LucideIcon } from "lucide-react";

import { HowItWorks } from "@/components/HowItWorks";
import { MarketingPageHero } from "@/components/MarketingPageHero";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Learn how to create, replay, journal, and review a ForexTestLab backtesting session.",
  alternates: { canonical: "/how-it-works" },
};

const DETAILS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Play, title: "Create the test", text: "Choose the market, historical starting point, replay length, session type, and simulated account balance." },
  { icon: CandlestickChart, title: "Trade what was visible", text: "Advance the replay at your own pace. Higher timeframes remain synchronized and future candles stay hidden." },
  { icon: NotebookPen, title: "Record the decision", text: "Add setup tags, confidence, screenshots, notes, and lessons while the original context is still fresh." },
  { icon: BarChart3, title: "Review the evidence", text: "Study performance, reopen individual trades on the chart, and compare results against your written process." },
];

export default function HowItWorksPage() {
  return (
    <PageShell>
      <MarketingPageHero
        eyebrow="How it works"
        title="From a trading idea to evidence you can review"
        description="ForexTestLab keeps the full testing loop in one saved session, from the first candle through the final journal review."
        secondary={{ label: "Explore features", href: "/features" }}
      />
      <HowItWorks />
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className="container-page">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2">
            {DETAILS.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className="bg-surface-950 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-surface-900 text-brand-300"><Icon size={17} aria-hidden /></span>
                  <span className="font-mono text-xs text-slate-500">0{index + 1}</span>
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
