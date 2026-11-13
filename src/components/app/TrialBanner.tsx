import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PRO_TRIAL_PATH } from "@/lib/site";

/** Wide dashboard banner offering the 14-day Pro trial to an eligible Free account. */
export function TrialBanner() {
  return (
    <section
      aria-label="14-day Pro trial"
      className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-brand-400/35 bg-[radial-gradient(80%_140%_at_0%_0%,rgba(14,165,233,.32),transparent),linear-gradient(90deg,#0a2240,#081427)] p-5 text-white sm:flex-row sm:items-center"
    >
      <div>
        <p className="text-lg font-extrabold tracking-tight sm:text-xl">Unlock Pro free for 14 days</p>
        <p className="mt-0.5 text-sm text-slate-300">Every market, full history, AI Analyst, prop challenges and exports. Cancel any time before day 14.</p>
      </div>
      <Link href={PRO_TRIAL_PATH} className="btn-primary shrink-0 px-5 py-3 shadow-glow">
        Start trial <ArrowRight size={15} aria-hidden />
      </Link>
    </section>
  );
}
