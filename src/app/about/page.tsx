import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Eye, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about ForexTestLab — an independent forex backtesting and market-replay platform in development, built for structured, honest strategy testing.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  {
    icon: Eye,
    title: "Honest by default",
    description:
      "We describe what the product can and cannot do. No fabricated results, no unrealistic promises, and clear labelling of features still in development.",
  },
  {
    icon: Compass,
    title: "Built for process",
    description:
      "Our focus is helping traders build a disciplined, documented testing routine — not selling shortcuts to profit.",
  },
  {
    icon: ShieldCheck,
    title: "Independent",
    description:
      "ForexTestLab is an independent project. We are not a broker and are not affiliated with any charting provider.",
  },
];

export default function AboutPage() {
  return (
    <PageShell>
      <div className="container-page py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow">About</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            About ForexTestLab
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            ForexTestLab is a web-based forex backtesting and market-replay
            platform in development. It is being built to help traders replay
            historical currency-market data, practise execution with simulated
            trades, and review their strategies in a structured environment.
          </p>

          <div className="mt-8 space-y-5 text-base leading-relaxed text-slate-400">
            <p>
              Many traders struggle to evaluate a strategy objectively.
              Reviewing a chart after the fact makes almost any approach look
              obvious, and live practice is expensive when real capital is on
              the line. ForexTestLab aims to sit in between: a controlled space
              to step through historical data candle by candle, place simulated
              trades under defined risk rules, and keep an organised record of
              what happened.
            </p>
            <p>
              The platform is intended purely for research, practice, and
              strategy evaluation. It is not a broker, it does not execute real
              orders, and it does not provide investment or financial advice.
              Historical and simulated results never guarantee future
              performance.
            </p>
            <p>
              We are building in the open and publishing an honest roadmap.
              Features, integrations, pricing, and timelines may change before a
              public release.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {VALUES.map((value) => {
              const Icon = value.icon;
              return (
                <div key={value.title} className="card">
                  <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-surface-900 text-brand-300">
                    <Icon size={18} aria-hidden />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-white">
                    {value.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <Link href="/waitlist" className="btn-primary">
              Join the Waitlist
            </Link>
            <Link href="/contact" className="btn-secondary">
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
