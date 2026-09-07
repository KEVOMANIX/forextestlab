import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

export function PreLaunchAccessCard({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`relative overflow-hidden rounded-3xl border border-brand-400/35 bg-[linear-gradient(135deg,rgba(34,195,160,.18),rgba(17,23,37,.96)_58%,rgba(59,107,255,.1))] shadow-card ${compact ? "p-6 sm:p-7" : "p-7 sm:p-9"}`}>
      <div aria-hidden className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="relative mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-300/25 bg-brand-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">
          <Sparkles size={13} aria-hidden /> Pre-launch access
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">ForexTestLab is free while we prepare for launch.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">Use the complete replay workspace without entering payment details. Billing will only open when the product is ready.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-200">
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-brand-300" aria-hidden /> No payment required</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-brand-300" aria-hidden /> Full workspace access</span>
        </div>
        <Link href="/sign-up" className="btn-primary mt-7 px-6 py-3 shadow-glow">Create your free account <ArrowRight size={16} aria-hidden /></Link>
      </div>
    </aside>
  );
}
