import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  LogIn,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

function ScreenFrame({
  src,
  alt,
  label,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  label: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/[0.12] bg-surface-800/95 p-1.5 shadow-[0_45px_140px_-45px_rgba(0,0,0,.95)] ${className}`}
    >
      <div className="flex h-9 items-center justify-between rounded-t-xl border-b border-white/[0.08] bg-surface-900/95 px-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-bear/80" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-brand-400/80" />
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-500">
          {label}
        </span>
        <span className="flex items-center gap-1.5 text-[9px] font-medium text-brand-300">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
          Live
        </span>
      </div>
      <div className="relative overflow-hidden rounded-b-xl">
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={940}
          priority={priority}
          sizes="(max-width: 1024px) 100vw, 78vw"
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

const PROOF_POINTS = [
  { icon: Play, label: "Historical replay" },
  { icon: Clock3, label: "New York time" },
  { icon: ShieldCheck, label: "Private auto-save" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-12 pt-16 sm:pt-20 lg:pb-16 lg:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(to_bottom,#070a12_0%,#071015_46%,#070a12_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-grid-faint [background-size:64px_64px] opacity-70 [mask-image:radial-gradient(75%_65%_at_50%_35%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-48 -z-10 h-[42rem] w-[70rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(34,195,160,.17),rgba(59,107,255,.06)_42%,transparent_70%)] blur-[80px]"
      />

      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="text-center">
            <p className="eyebrow animate-fade-up">
              <Sparkles size={13} aria-hidden />
              A workspace for deliberate strategy testing
            </p>
            <h1 className="mx-auto mt-6 max-w-6xl text-balance text-5xl font-bold leading-[0.98] tracking-[-0.05em] text-white animate-fade-up sm:text-6xl lg:text-[5rem]">
              Build a trading process you can{" "}
              <span className="bg-gradient-to-r from-brand-200 via-brand-300 to-accent-400 bg-clip-text text-transparent">
                actually measure.
              </span>
            </h1>
          </div>

          <div className="mt-8 grid gap-7 border-t border-white/[0.08] pt-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="max-w-2xl text-pretty text-base leading-7 text-slate-300 animate-fade-up sm:text-lg">
                Replay historical forex markets, practise entries and exits,
                and review every session through structured performance analytics.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                {["Replay without future candles", "Execute simulated trades", "Review session analytics"].map(
                  (item) => (
                    <span
                      key={item}
                      className="flex items-center gap-2 text-xs font-medium text-slate-400"
                    >
                      <Check size={13} className="text-brand-300" aria-hidden />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="lg:min-w-[23rem]">
              <div className="flex flex-col gap-3 animate-fade-up sm:flex-row lg:justify-end">
              <Link
                href={TRIAL_SIGN_UP_PATH}
                className="btn-primary min-h-12 w-full px-6 shadow-glow sm:w-auto"
              >
                Start free trial
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link
                href="#product-preview"
                className="btn-secondary min-h-12 w-full px-6 sm:w-auto"
              >
                <BarChart3 size={16} aria-hidden />
                Explore product
              </Link>
            </div>
              <p className="mt-3 text-center text-xs text-slate-500 lg:text-right">
                Three one-month trial sessions · No payment required
              </p>
              <p className="mt-2 text-center text-xs text-slate-400 lg:text-right">
                Already have an account?{" "}
                <Link
                  href="/sign-in?next=%2Faccount%2Fcontinue"
                  className="inline-flex items-center gap-1 font-semibold text-brand-300 transition-colors hover:text-brand-200"
                >
                  <LogIn size={12} aria-hidden />
                  Sign in to your workspace
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="dimension-stage relative mt-14 lg:mt-16">
          <div
            aria-hidden
            className="absolute -left-[4%] top-[14%] hidden w-[46%] lg:block"
          >
            <ScreenFrame
              src="/product/session-dashboard.webp"
              alt=""
              label="Session dashboard"
              className="dimension-stage-left opacity-60"
            />
          </div>
          <div
            aria-hidden
            className="absolute -right-[4%] top-[14%] hidden w-[46%] lg:block"
          >
            <ScreenFrame
              src="/product/session-analytics.webp"
              alt=""
              label="Session analytics"
              className="dimension-stage-right opacity-60"
            />
          </div>

          <div className="dimension-stage-main relative z-10 mx-auto w-full lg:w-[72%]">
            <div
              aria-hidden
              className="absolute -inset-10 -z-10 rounded-[3rem] bg-brand-400/[0.12] blur-[70px]"
            />
            <ScreenFrame
              src="/product/market-replay.webp"
              alt="ForexTestLab historical market replay terminal with candlestick chart, positions, execution controls, and session metrics"
              label="Market replay terminal"
              priority
            />

            <div className="absolute -bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-xl border border-white/[0.11] bg-surface-900/95 p-1.5 shadow-2xl backdrop-blur sm:flex">
              {PROOF_POINTS.map(({ icon: Icon, label }, index) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 px-3 py-2 text-[10px] font-semibold text-slate-300 ${
                    index > 0 ? "border-l border-white/[0.08]" : ""
                  }`}
                >
                  <Icon size={13} className="text-brand-300" aria-hidden />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div
            aria-hidden
            className="mx-auto mt-14 h-px w-[70%] bg-gradient-to-r from-transparent via-brand-400/35 to-transparent"
          />
        </div>
      </div>
    </section>
  );
}
