import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/Logo";

/**
 * Authentication should feel like crossing the threshold into the replay desk,
 * not a separate marketing page.
 *
 * The desk is deliberately reduced to texture: blurred past legibility and sunk
 * under a heavy scrim. It used to sit at 95% opacity and full sharpness, which
 * meant the screenshot's own interface competed with the real one — its session
 * tab landing under the live logo, its toolbar under "Back to home" — so the
 * page read as two overlapping products. Nothing in the plate should be
 * readable; it is a lit room behind a frosted door, not a second screen.
 *
 * `scale-110` is not decorative. A blur samples past the element's edges, so an
 * unscaled plate feathers to transparent at all four sides and the vignette
 * turns into a visible frame.
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
          className="scale-110 object-cover object-center opacity-[.62] saturate-[.8] blur-[6px]"
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#050912]/42" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(9,24,32,.12),rgba(5,9,18,.8)_76%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:52px_52px] opacity-10" />
      <div aria-hidden className="auth-reveal-scan pointer-events-none absolute inset-x-0 top-[47%] h-px bg-brand-300/35 shadow-[0_0_24px_3px_rgba(45,212,191,.14)]" />

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
