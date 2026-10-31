import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { TRIAL_SIGN_UP_PATH } from "@/lib/site";
import { ProductDemoVideo } from "@/components/ProductDemoVideo";

function ScreenFrame({
  src,
  alt,
  label,
  priority = false,
  className = "",
  imageIncludesChrome = false,
  mobileZoom = false,
  width = 1600,
  height = 940,
  video,
}: {
  src: string;
  alt: string;
  label: string;
  priority?: boolean;
  className?: string;
  imageIncludesChrome?: boolean;
  /**
   * A full desktop terminal shrunk to a 390px phone is unreadable, and this
   * section's whole claim is that these are real screens. On small viewports
   * the frame becomes a fixed-ratio window onto the chart itself, at roughly
   * 2x, instead of showing the entire UI at an illegible size.
   */
  mobileZoom?: boolean;
  width?: number;
  height?: number;
  video?: { webm?: string; mp4: string; poster: string };
}) {
  return (
    <div
      className={`marketing-dark-demo marketing-product-frame overflow-hidden rounded-2xl border border-white/[0.12] bg-surface-800/95 shadow-[0_45px_140px_-45px_rgba(0,0,0,.72)] ${imageIncludesChrome ? "p-0" : "p-1.5"} ${className}`}
    >
      {!imageIncludesChrome && (
        <div className="flex h-9 items-center justify-between rounded-t-xl border-b border-white/[0.08] bg-surface-900/95 px-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-loss/80" />
            <span className="h-2 w-2 rounded-full bg-amber-400/80" />
            <span className="h-2 w-2 rounded-full bg-brand-400/80" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">
            {label}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
            Live
          </span>
        </div>
      )}
      <div
        className={`relative overflow-hidden ${imageIncludesChrome ? "rounded-2xl" : "rounded-b-xl"} ${
          mobileZoom ? "aspect-[4/3] sm:aspect-auto" : ""
        }`}
      >
        {video ? (
          <ProductDemoVideo {...video} alt={alt} width={width} height={height} priority={priority} mobileZoom={mobileZoom} />
        ) : (
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority={priority}
            sizes={
              mobileZoom
                ? "(max-width: 640px) 200vw, (max-width: 1024px) 100vw, 78vw"
                : "(max-width: 1024px) 100vw, 78vw"
            }
            className={
              mobileZoom
                ? "absolute -left-[12%] -top-[8%] h-auto w-[200%] max-w-none sm:static sm:left-auto sm:top-auto sm:w-full"
                : "h-auto w-full"
            }
          />
        )}
      </div>
    </div>
  );
}

const TRUST_POINTS = ["Free to start", "No card required", "Sessions auto-save"];

const PROOF_POINTS = [
  "Historical replay",
  "New York time",
  "Private auto-save",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-12 pt-8 sm:pt-10 lg:pb-16 lg:pt-12">
      <div
        aria-hidden
        className="marketing-hero-background pointer-events-none absolute inset-0 -z-30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-grid-faint [background-size:64px_64px] opacity-25 [mask-image:radial-gradient(75%_65%_at_50%_35%,black,transparent)]"
      />
      <div
        aria-hidden
        className="marketing-hero-glow pointer-events-none absolute left-1/2 top-48 -z-10 h-[42rem] w-[70rem] -translate-x-1/2 rounded-[50%] blur-[80px]"
      />

      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="mx-auto max-w-[1240px] text-center">
          <div className="text-center">
            <Link
              href="/markets"
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-900/80 py-1 pl-1 pr-3 text-[13px] text-slate-300 transition-colors animate-fade-up hover:border-brand-400/40 hover:text-white"
            >
              <span className="rounded-full bg-brand-400/15 px-2 py-0.5 text-xs font-bold text-brand-200">New</span>
              WTI crude oil is now in replay
              <ArrowRight size={13} aria-hidden />
            </Link>
            <h1 className="mx-auto max-w-6xl text-balance text-3xl font-bold leading-[1.22] tracking-[-0.025em] text-white animate-fade-up sm:text-4xl lg:text-[3.25rem]">
              Build confidence in your strategy.
              <span className="mt-2 block text-brand-200 sm:mt-3">
                One backtest at a time.
              </span>
            </h1>
          </div>

          <div className="mt-5 grid gap-6">
            <div>
              <p className="mx-auto max-w-3xl text-pretty text-base leading-7 text-slate-300 animate-fade-up sm:text-lg">
                Replay markets, practise your strategy, and review your results.
              </p>
            </div>

            <div className="animate-fade-up">
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                <Link
                  href={TRIAL_SIGN_UP_PATH}
                  className="btn-primary min-h-12 w-full rounded-full px-7 shadow-glow sm:w-auto"
                >
                  Start backtesting free
                  <ArrowRight size={16} aria-hidden />
                </Link>
                <Link
                  href="#product-preview"
                  className="group inline-flex min-h-12 items-center gap-2 px-3 text-[15px] font-semibold text-white transition-colors hover:text-brand-200"
                >
                  Explore the workspace
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
              <ul className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
                {TRUST_POINTS.map(point => (
                  <li key={point} className="flex items-center gap-1.5">
                    <Check size={15} strokeWidth={2.5} className="text-brand-300" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="dimension-stage relative mt-10 lg:mt-12">
          <div
            aria-hidden
            className="absolute -left-[4%] top-[14%] hidden w-[46%] lg:block"
          >
            <ScreenFrame
              src="/product/session-dashboard-20261008.webp"
              alt=""
              label="Session dashboard"
              width={1470}
              height={735}
              className="dimension-stage-left opacity-60"
            />
          </div>
          <div
            aria-hidden
            className="absolute -right-[4%] top-[14%] hidden w-[46%] lg:block"
          >
            <ScreenFrame
              src="/product/session-analytics-20261008.webp"
              alt=""
              label="Session analytics"
              width={1470}
              height={765}
              className="dimension-stage-right opacity-60"
            />
          </div>

          <div className="dimension-stage-main relative z-10 mx-auto w-full lg:w-[82%]">
            <div
              aria-hidden
              className="absolute -inset-10 -z-10 rounded-[3rem] bg-brand-400/[0.12] blur-[70px]"
            />
            <ScreenFrame
              src="/product/market-replay-20261008.webp"
              alt="ForexTestLab historical market replay terminal with candlestick chart, positions, execution controls, and session metrics"
              label="Market replay terminal"
              priority
              imageIncludesChrome
              mobileZoom
              width={1906}
              height={946}
              video={{
                mp4: "/product/market-replay-20261008.mp4",
                poster: "/product/market-replay-video-20261008.webp",
              }}
            />

            <div className="absolute -bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-xl border border-white/[0.11] bg-surface-900/95 p-1.5 shadow-2xl backdrop-blur sm:flex">
              {PROOF_POINTS.map((label, index) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-slate-300 ${
                    index > 0 ? "border-l border-white/[0.08]" : ""
                  }`}
                >
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
