import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  LogIn,
  Play,
  ShieldCheck,
} from "lucide-react";

import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

function ScreenFrame({
  src,
  alt,
  priority = false,
  mobileZoom = false,
  width = 1600,
  height = 940,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  /** Keeps the actual chart legible instead of shrinking a desktop UI to fit a phone. */
  mobileZoom?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-surface-800/95 shadow-[0_36px_100px_-42px_rgba(0,0,0,.95)]">
      <div
        className={`relative overflow-hidden rounded-2xl ${
          mobileZoom ? "aspect-[4/3] sm:aspect-auto" : ""
        }`}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes="(max-width: 640px) 200vw, (max-width: 1024px) 100vw, 58vw"
          className={
            mobileZoom
              ? "absolute -left-[12%] -top-[8%] h-auto w-[200%] max-w-none sm:static sm:left-auto sm:top-auto sm:w-full"
              : "h-auto w-full"
          }
        />
      </div>
    </div>
  );
}

const PROOF_POINTS = [
  { icon: Play, label: "Historical market replay" },
  { icon: Clock3, label: "New York session time" },
  { icon: ShieldCheck, label: "Private auto-save" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-14 sm:pb-20 sm:pt-20 lg:pb-24 lg:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(to_bottom,#070a12_0%,#071015_46%,#070a12_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-grid-faint [background-size:64px_64px] opacity-60 [mask-image:radial-gradient(75%_65%_at_55%_35%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[68%] top-12 -z-10 h-[38rem] w-[52rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(34,195,160,.15),rgba(59,107,255,.05)_45%,transparent_72%)] blur-[80px]"
      />

      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14 xl:gap-20">
          <div className="max-w-xl lg:pb-3">
            <p className="eyebrow animate-fade-up">
              A workspace for deliberate strategy testing
            </p>
            <h1 className="mt-6 text-balance text-5xl font-bold leading-[0.98] tracking-[-0.05em] text-white animate-fade-up sm:text-6xl lg:text-[4.25rem]">
              Build a trading process you can{" "}
              <span className="bg-gradient-to-r from-brand-200 via-brand-300 to-accent-400 bg-clip-text text-transparent">
                actually measure.
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-pretty text-base leading-7 text-slate-300 animate-fade-up sm:text-lg">
              Replay historical forex markets, practise entries and exits, and
              turn each session into structured performance insight.
            </p>

            <div className="mt-8 flex flex-col gap-3 animate-fade-up sm:flex-row">
              <Link
                href={TRIAL_SIGN_UP_PATH}
                className="btn-primary min-h-14 w-full px-7 text-base shadow-glow sm:w-auto"
              >
                Start free trial
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link
                href="#product-preview"
                className="btn-secondary min-h-14 w-full px-6 sm:w-auto"
              >
                See how it works
              </Link>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Three one-month trial sessions · No payment required
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Already have an account?{" "}
              <Link
                href="/sign-in?next=%2Faccount%2Fcontinue"
                className="inline-flex items-center gap-1 font-semibold text-brand-300 transition-colors hover:text-brand-200"
              >
                <LogIn size={14} aria-hidden />
                Sign in to your workspace
              </Link>
            </p>

            <div
              className="mt-9 grid gap-3 border-t border-white/[0.08] pt-6 sm:grid-cols-3 sm:gap-2"
              role="list"
            >
              {PROOF_POINTS.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-sm text-slate-300" role="listitem">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-brand-400/20 bg-brand-400/10 text-brand-300">
                    <Icon size={14} aria-hidden />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative animate-fade-up">
            <div
              aria-hidden
              className="absolute -inset-8 -z-10 rounded-[3rem] bg-brand-400/[0.12] blur-[60px]"
            />
            <ScreenFrame
              src="/product/market-replay-20260814-v2.webp"
              alt="ForexTestLab historical market replay terminal with candlestick chart, positions, execution controls, and session metrics"
              priority
              mobileZoom
              width={1786}
              height={880}
            />
            <div className="absolute -bottom-4 left-5 hidden items-center gap-2 rounded-lg border border-white/[0.12] bg-surface-900/95 px-3 py-2 text-xs font-medium text-slate-300 shadow-xl backdrop-blur sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden />
              Real market replay workspace
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
