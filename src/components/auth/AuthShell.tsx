import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BarChart3, Check, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/Logo";

const VALUE_POINTS = [
  "Replay historical price action with your own pace and rules.",
  "Keep every testing decision, chart mark-up, and trade journal in one place.",
  "Turn practice into evidence with review-ready performance analytics.",
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="app-shell relative min-h-[100dvh] overflow-hidden bg-[var(--app-bg)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:48px_48px] opacity-40 [mask-image:linear-gradient(90deg,black,transparent_75%)]" />
      <div aria-hidden className="pointer-events-none absolute -left-56 top-1/4 h-[34rem] w-[34rem] rounded-full bg-brand-400/[0.12] blur-[140px]" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-sky-400/[0.06] blur-[120px]" />

      <div className="relative z-10 mx-auto grid min-h-[100dvh] max-w-[1800px] lg:grid-cols-[minmax(0,1.22fr)_minmax(29rem,.78fr)]">
        <section className="relative hidden min-h-[100dvh] overflow-hidden border-r app-border px-10 py-9 lg:flex lg:flex-col xl:px-16">
          <header className="flex items-center justify-between">
            <Logo className="h-9" priority />
            <span className="rounded-full border border-brand-400/20 bg-brand-400/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              Historical market replay
            </span>
          </header>

          <div className="relative z-10 mt-16 max-w-[43rem] xl:mt-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-300">Your trading lab, made private</p>
            {/* The form owns the page's h1. */}
            <p className="mt-5 max-w-2xl text-balance text-4xl font-bold leading-[1.03] tracking-[-0.045em] text-white xl:text-[3.55rem]">
              Build confidence from the charts, not guesswork.
            </p>
            <p className="mt-5 max-w-xl text-[15px] leading-7 app-muted">
              A focused workspace for replaying markets, documenting your execution, and reviewing the evidence behind every decision.
            </p>

            <ul className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {VALUE_POINTS.map((point, index) => (
                <li key={point} className="min-w-0 border-l border-brand-400/35 pl-3.5">
                  <span className="mb-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-400/10 text-[10px] font-bold text-brand-300">
                    0{index + 1}
                  </span>
                  <span className="block text-xs leading-5 app-muted">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-auto pt-12">
            <div aria-hidden className="absolute inset-x-8 bottom-0 h-2/3 rounded-[2.5rem] bg-brand-400/[0.08] blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.13] bg-[#090f19] p-1.5 shadow-[0_35px_100px_-42px_rgba(0,0,0,0.95)]">
              <div className="absolute inset-x-0 top-0 z-10 flex h-8 items-center gap-1.5 bg-[#111a28]/95 px-3">
                <i className="h-1.5 w-1.5 rounded-full bg-[#f26c7b]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#f4b84e]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#31c48d]" />
                <span className="ml-2 text-[9px] font-medium tracking-wide text-white/40">FOREXTESTLAB / REPLAY</span>
              </div>
              <Image
                src="/product/market-replay-20260814-v2.webp"
                alt="ForexTestLab historical market replay terminal"
                width={1786}
                height={880}
                priority
                sizes="(min-width: 1024px) 63vw, 0px"
                className="mt-7 h-auto w-full rounded-xl opacity-95"
              />
            </div>
          </div>
        </section>

        <section className="relative flex min-h-[100dvh] flex-col px-5 py-6 sm:px-8 lg:px-12 xl:px-16">
          <header className="flex min-h-10 items-center justify-between">
            <div className="lg:hidden"><Logo className="h-8" priority /></div>
            <Link href="/" className="ml-auto inline-flex items-center gap-2 rounded-full border app-border bg-[var(--app-panel)]/55 px-3.5 py-2 text-xs font-semibold app-muted transition-colors hover:border-brand-400/35 hover:text-brand-300">
              <ArrowLeft size={14} aria-hidden />
              Back to home
            </Link>
          </header>

          <div className="my-auto mx-auto w-full max-w-[29rem] py-12 lg:py-16">
            {children}
            <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs app-muted">
              <ShieldCheck size={14} className="shrink-0 text-brand-300" aria-hidden />
              Private workspace. Secure sign-in.
            </div>
          </div>

          <p className="hidden items-center justify-center gap-2 text-center text-[11px] app-muted lg:flex">
            <Check size={13} className="text-brand-300" aria-hidden />
            Your progress stays connected to your account.
            <BarChart3 size={13} className="ml-1 text-brand-300" aria-hidden />
          </p>
        </section>
      </div>
    </main>
  );
}
