import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HelpCircle, Mail, Plus } from "lucide-react";

import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Answers about ForexTestLab data, replay, simulated trading, trials, billing, and account access.",
  alternates: { canonical: "/faq" },
};

const GROUPS = [
  { title: "Product", items: [
    ["What is ForexTestLab?", "A web-based backtesting workspace for replaying historical markets, placing simulated trades, journaling decisions, and reviewing performance."],
    ["Can I replay historical markets?", "Yes. A replay reveals historical candles progressively so later price action remains hidden until the session advances."],
    ["Can I simulate trades?", "Yes. You can place simulated market and pending orders, manage position size, stops, and targets, and then review the result."],
  ] },
  { title: "Access and accounts", items: [
    ["What is included in the free trial?", "A new user can create trial sessions and experience the core replay workflow before choosing paid access."],
    ["Will my sessions be saved?", "Signed-in sessions are private and saved to your account so you can resume and review them later."],
    ["Where can I get help?", "Use the support page or in-app help button. Include the affected session and what you expected to happen when reporting a problem."],
  ] },
  { title: "Risk and independence", items: [
    ["Is ForexTestLab a broker?", "No. ForexTestLab does not accept trading deposits or execute live-market orders."],
    ["Does backtesting guarantee profitable results?", "No. Historical and simulated results cannot guarantee future performance."],
    ["Is ForexTestLab affiliated with TradingView?", "No. ForexTestLab is an independent product and is not sponsored or endorsed by TradingView."],
  ] },
] as const;

export default function FAQPage() {
  return (
    <PageShell>
      <section className="border-b border-white/10 py-12 sm:py-16">
        <div className="container-page grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Answers and support</p><h1 className="mt-4 text-balance text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">What would you like to know?</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">Product, account, and risk information in one place.</p></div>
          <div className="border-l border-white/10 pl-5"><Mail size={18} className="text-brand-300" /><p className="mt-3 text-sm font-semibold text-white">Need a specific answer?</p><p className="mt-1 text-sm leading-6 text-slate-400">Contact support and include the session name when your question concerns a replay.</p><Link href="/support" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-300 hover:text-brand-200">Open support <ArrowRight size={14} /></Link></div>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[15rem_1fr] lg:gap-16">
          <aside className="lg:sticky lg:top-28 lg:self-start"><span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-surface-900 text-brand-300"><HelpCircle size={19} /></span><h2 className="mt-4 text-lg font-semibold text-white">Browse by topic</h2><nav className="mt-4 space-y-1" aria-label="FAQ topics">{GROUPS.map((group) => <a key={group.title} href={`#${group.title.toLowerCase().replaceAll(" ", "-")}`} className="block border-l border-white/10 py-1.5 pl-3 text-sm text-slate-400 hover:border-brand-300 hover:text-white">{group.title}</a>)}</nav></aside>
          <div className="space-y-12">
            {GROUPS.map((group) => <section key={group.title} id={group.title.toLowerCase().replaceAll(" ", "-")} className="scroll-mt-28"><h2 className="border-b border-white/10 pb-4 text-xl font-semibold text-white">{group.title}</h2><div className="divide-y divide-white/10">{group.items.map(([question, answer]) => <details key={question} className="group"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 font-medium text-white marker:content-none">{question}<Plus size={17} className="shrink-0 text-brand-300 transition-transform group-open:rotate-45" /></summary><p className="max-w-3xl pb-5 pr-10 text-sm leading-6 text-slate-400">{answer}</p></details>)}</div></section>)}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
