import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Eye, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about ForexTestLab, an independent forex backtesting and market-replay platform.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  {
    icon: Eye,
    title: "Honest by default",
    description: "No fabricated results, unrealistic promises, or hidden limitations.",
  },
  {
    icon: Compass,
    title: "Built for process",
    description: "Tools for disciplined, documented strategy testing.",
  },
  {
    icon: ShieldCheck,
    title: "Independent",
    description: "ForexTestLab is not a broker or affiliated with a charting provider.",
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
            Replay historical markets, practise simulated execution, and review
            your strategies in one structured workspace.
          </p>

          <p className="mt-8 text-base leading-relaxed text-slate-400">
            ForexTestLab is built for research and practice. It does not execute
            real orders or provide investment advice. Historical and simulated
            results do not guarantee future performance.
          </p>

          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {VALUES.map((value) => {
              const Icon = value.icon;
              return (
                <div key={value.title} className="card">
                  <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-surface-900 text-brand-300">
                    <Icon size={18} aria-hidden />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-white">{value.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{value.description}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className="btn-primary">Create account</Link>
            <Link href="/contact" className="btn-secondary">Contact us</Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
