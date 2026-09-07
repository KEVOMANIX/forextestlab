import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";

import { Logo } from "@/components/Logo";

/**
 * Authentication should feel like crossing the threshold into the replay desk,
 * not a separate marketing page. The terminal remains intentionally subdued so
 * the form is always the only actionable focus.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="app-shell relative min-h-[100dvh] overflow-hidden bg-[#060a11]">
      <div aria-hidden className="auth-reveal-stage absolute inset-0">
        <Image
          src="/product/market-replay-20260814-v2.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-70 saturate-[.82]"
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#050912]/55 backdrop-blur-[3px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(9,24,32,.18),rgba(5,9,18,.86)_67%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:52px_52px] opacity-30" />
      <div aria-hidden className="auth-reveal-scan pointer-events-none absolute inset-x-0 top-[47%] h-px bg-brand-300/60 shadow-[0_0_24px_3px_rgba(45,212,191,.25)]" />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-7 lg:px-12">
        <Logo className="h-8 sm:h-9" priority />
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0c1420]/70 px-3.5 py-2 text-xs font-semibold text-slate-300 shadow-lg backdrop-blur-md transition-all hover:-translate-y-px hover:border-brand-400/40 hover:text-brand-300"
        >
          <ArrowLeft size={14} aria-hidden />
          Back to home
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-5.5rem)] w-full max-w-[34rem] items-center px-5 pb-16 pt-4 sm:px-0 sm:pb-20">
        <div className="auth-reveal-card w-full">
          <div className="mb-5 flex items-center justify-center gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300">
            <span className="h-px w-7 bg-brand-400/50" />
            Your private replay desk
            <span className="h-px w-7 bg-brand-400/50" />
          </div>
          {children}
          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
            <ShieldCheck size={14} className="shrink-0 text-brand-300" aria-hidden />
            Secure access to your saved workspaces and journal.
          </p>
        </div>
      </section>

      <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 hidden w-max -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0b131e]/75 px-4 py-2 text-[11px] text-slate-400 backdrop-blur-md lg:flex">
        <Sparkles size={13} className="text-brand-300" aria-hidden />
        Replay markets. Refine your process. Review the evidence.
      </div>
    </main>
  );
}
