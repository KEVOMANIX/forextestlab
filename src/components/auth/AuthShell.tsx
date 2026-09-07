import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
          className="object-cover object-[25%_25%] opacity-90 saturate-[.92] lg:origin-[24%_24%] lg:scale-[2.05]"
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#050912]/20" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,transparent_10%,rgba(5,9,18,.42)_78%,rgba(5,9,18,.64))]" />
      <div aria-hidden className="auth-reveal-scan pointer-events-none absolute left-1/2 top-[47%] h-px w-[min(42rem,72vw)] -translate-x-1/2 bg-brand-300/35 shadow-[0_0_20px_2px_rgba(45,212,191,.16)]" />

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
          {children}
        </div>
      </section>
    </main>
  );
}
