import type { Metadata } from "next";

import { PageShell } from "@/components/PageShell";
import { LearnIndex } from "@/components/learn/LearnIndex";
import { getLearnArticles, toSummary } from "@/lib/learn";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Learn",
  description: "Practical guides to backtesting, journaling, risk, analytics, and ForexTestLab chart tools.",
  alternates: { canonical: "/learn" },
};

export default function LearnPage() {
  const articles = getLearnArticles().map(toSummary);
  return (
    <PageShell>
      <section className="container-page">
        <div className="pb-8 pt-14 sm:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-300">ForexTestLab Learn</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Guides for traders who test first.</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
            Practical articles on backtesting, journaling, risk and reading your results, from your first replay to judging whether a strategy holds up.
          </p>
        </div>
        <LearnIndex articles={articles} />
      </section>
    </PageShell>
  );
}
