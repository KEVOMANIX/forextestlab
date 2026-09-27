import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  LogIn,
  Play,
  ShieldCheck,
} from "lucide-react";

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
  video?: { webm: string; mp4: string; poster: string };
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/[0.12] bg-surface-800/95 shadow-[0_45px_140px_-45px_rgba(0,0,0,.95)] ${imageIncludesChrome ? "p-0" : "p-1.5"} ${className}`}
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

const PROOF_POINTS = [
  { icon: Play, label: "Historical replay" },
  { icon: Clock3, label: "New York time" },
  { icon: ShieldCheck, label: "Private auto-save" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.08] py-14 sm:py-16 lg:py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,#070a12_0%,#071015_58%,#070a12_100%)]" />
      <div className="container-page grid items-center gap-12 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300 animate-fade-up">
            Forex backtesting &amp; market replay
          </p>
          <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-white animate-fade-up sm:text-5xl lg:text-6xl">
            Build a trading process you can{" "}
            <span className="text-brand-200">actually measure.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-slate-300 animate-fade-up sm:text-lg">
            Replay historical forex markets, practise entries and exits, and
            review every session through structured performance analytics.
          </p>
          <div className="mt-6 space-y-2.5">
            {["Replay without future candles", "Execute simulated trades", "Review session analytics"].map(
              (item) => (
                <span key={item} className="flex items-center gap-2.5 text-sm text-slate-400">
                  <Check size={14} className="text-brand-300" aria-hidden />
                  {item}
                </span>
              ),
            )}
          </div>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link href={TRIAL_SIGN_UP_PATH} className="btn-primary min-h-12 w-full px-6 sm:w-auto">
              Start free trial
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="#product-preview" className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-slate-300 transition-colors hover:text-brand-200">
              Explore the product
              <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Three one-month trial sessions · No payment required
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Already have an account?{" "}
            <Link href="/sign-in?next=%2Faccount%2Fcontinue" className="inline-flex items-center gap-1 font-semibold text-brand-300 transition-colors hover:text-brand-200">
              <LogIn size={12} aria-hidden />
              Sign in
            </Link>
          </p>
        </div>

        <div className="min-w-0">
          <ScreenFrame
            src="/product/market-replay-20260814-v2.webp"
            alt="ForexTestLab historical market replay terminal with candlestick chart, positions, execution controls, and session metrics"
            label="Market replay terminal"
            priority
            imageIncludesChrome
            mobileZoom
            width={1786}
            height={880}
            video={{
              webm: "/product/market-replay-demo.webm",
              mp4: "/product/market-replay-demo.mp4",
              poster: "/product/market-replay-demo-poster.jpg",
            }}
          />
          <div className="mt-3 grid grid-cols-3 divide-x divide-white/[0.08] border-t border-white/[0.08] pt-3">
            {PROOF_POINTS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center justify-center gap-2 px-2 text-[11px] font-semibold text-slate-400">
                <Icon size={13} className="shrink-0 text-brand-300" aria-hidden />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
