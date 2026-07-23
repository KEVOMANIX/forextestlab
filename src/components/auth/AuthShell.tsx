import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  History,
  Play,
  ShieldCheck,
} from "lucide-react";

import { Logo } from "@/components/Logo";

const BENEFITS = [
  { icon: Play, text: "Replay historical markets candle by candle" },
  { icon: History, text: "Resume private sessions from where you stopped" },
  { icon: BarChart3, text: "Review decisions through structured analytics" },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main"
      className="app-shell relative min-h-screen overflow-hidden bg-[var(--app-bg)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:54px_54px] opacity-60 [mask-image:radial-gradient(75%_70%_at_50%_35%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-52 top-10 h-[38rem] w-[38rem] rounded-full bg-brand-400/[0.09] blur-[130px]"
      />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[minmax(0,1.12fr)_minmax(31rem,.88fr)]">
        <section className="relative hidden overflow-hidden border-r app-border px-10 pb-10 pt-28 lg:flex lg:flex-col xl:px-16">
          <div className="absolute left-10 top-8 xl:left-16">
            <Logo className="h-9" priority />
          </div>

          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
              Your strategy workspace
            </p>
            <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-white xl:text-5xl">
              Practise with purpose.
              <br />
              Review with evidence.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 app-muted">
              Access your private market-replay workspace, saved testing
              sessions, trade journal, and performance analytics.
            </p>

            <div className="mt-7 grid gap-3 xl:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-start gap-3 rounded-xl border app-border bg-[var(--app-panel)]/70 p-3.5"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-400/10 text-brand-300">
                    <Icon size={15} aria-hidden />
                  </span>
                  <span className="text-xs leading-5 app-muted">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-10 min-h-0 flex-1">
            <div
              aria-hidden
              className="absolute -inset-8 rounded-[2rem] bg-brand-400/[0.08] blur-3xl"
            />
            <div className="absolute inset-x-0 top-0 overflow-hidden rounded-2xl border border-white/[0.12] bg-surface-800/95 p-1.5 shadow-[0_40px_120px_-45px_rgba(0,0,0,.95)]">
              <div className="flex h-9 items-center justify-between rounded-t-xl border-b border-white/[0.08] bg-surface-900/95 px-3">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2 w-2 rounded-full bg-bear/75" />
                  <span className="h-2 w-2 rounded-full bg-amber-400/75" />
                  <span className="h-2 w-2 rounded-full bg-brand-400/75" />
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-500">
                  Market replay terminal
                </span>
                <span className="flex items-center gap-1.5 text-[9px] text-brand-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
                  Session active
                </span>
              </div>
              <Image
                src="/product/market-replay.webp"
                alt="ForexTestLab historical market replay terminal"
                width={1600}
                height={940}
                priority
                sizes="60vw"
                className="h-auto w-full rounded-b-xl"
              />
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen flex-col px-5 pb-10 pt-24 sm:px-8 lg:px-12 lg:py-16 xl:px-20">
          <div className="absolute left-5 right-5 top-6 flex items-center justify-between sm:left-8 sm:right-8 lg:left-12 lg:right-12 xl:left-20 xl:right-20">
            <div className="lg:hidden">
              <Logo className="h-8" priority />
            </div>
            <Link
              href="/"
              className="ml-auto inline-flex items-center gap-2 rounded-lg border app-border px-3 py-2 text-xs font-semibold app-muted transition-colors hover:border-brand-400/30 hover:text-brand-300"
            >
              <ArrowLeft size={14} aria-hidden />
              Back to homepage
            </Link>
          </div>

          <div className="my-auto mx-auto w-full max-w-[34rem]">
            {children}
            <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs app-muted">
              <ShieldCheck size={14} className="text-brand-300" aria-hidden />
              Secure access to your private ForexTestLab workspace
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
