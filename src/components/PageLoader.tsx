"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";

import logoMark from "../../public/logo-mark.png";

const bars = [
  { height: "h-5", delay: "0ms", tone: "bg-brand-400" },
  { height: "h-8", delay: "120ms", tone: "bg-brand-400" },
  { height: "h-6", delay: "240ms", tone: "bg-bear" },
  { height: "h-10", delay: "360ms", tone: "bg-brand-400" },
  { height: "h-7", delay: "480ms", tone: "bg-bear" },
  { height: "h-9", delay: "600ms", tone: "bg-brand-400" },
];

const MARKET_QUOTES = [
  "Trade the plan, not the noise.",
  "Patience is a position too.",
  "Risk first. Opportunity second.",
  "Preparation turns volatility into perspective.",
  "Consistency begins where impulse ends.",
  "Capital preserved is opportunity retained.",
  "The best decisions begin with a clear process.",
  "One disciplined setup is worth more than a hundred forced trades.",
] as const;

export function PageLoader({ message = "Loading…" }: { message?: string }) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    setQuoteIndex(Math.floor(Math.random() * MARKET_QUOTES.length));
    const interval = window.setInterval(() => {
      setQuoteIndex((current) => {
        const offset = 1 + Math.floor(Math.random() * (MARKET_QUOTES.length - 1));
        return (current + offset) % MARKET_QUOTES.length;
      });
    }, 4200);
    const recoveryTimer = window.setTimeout(() => setShowRecovery(true), 20_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(recoveryTimer);
    };
  }, []);

  return (
    <main
      className="fixed inset-0 z-[9999] grid min-h-[100dvh] place-items-center overflow-hidden bg-surface-950 p-6 text-slate-100"
      aria-label="Loading page"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-[size:48px_48px] opacity-30" />
      <div className="pointer-events-none absolute inset-0 bg-radial-brand" />

      <div className="relative flex w-full max-w-[24rem] -translate-y-8 flex-col items-center rounded-3xl border border-white/10 bg-surface-900/75 px-6 py-8 text-center shadow-2xl backdrop-blur-xl sm:-translate-y-10 sm:px-8">
        <div className="page-loader-mark relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-brand-400/30 bg-surface-800 shadow-glow">
          <span className="absolute -inset-2 rounded-[1.35rem] border border-brand-400/10" />
          <Image
            src={logoMark}
            alt=""
            priority
            className="relative h-10 w-10 object-contain"
          />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-300">
          ForexTestLab
        </p>

        <div className="mt-6 flex h-10 items-center justify-center gap-2" aria-hidden="true">
          {bars.map((bar, index) => (
            <span
              key={index}
              className={`page-loader-candle relative w-1.5 rounded-sm ${bar.height} ${bar.tone}`}
              style={{ animationDelay: bar.delay }}
            >
              <span className="absolute left-1/2 top-[-5px] h-[calc(100%+10px)] w-px -translate-x-1/2 bg-current opacity-70" />
            </span>
          ))}
        </div>

        <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="page-loader-progress h-full w-2/5 rounded-full bg-gradient-to-r from-brand-500 via-brand-300 to-accent-400" />
        </div>
        <p className="mt-3 text-xs font-medium text-slate-400">{message}</p>

        {showRecovery && (
          <div className="mt-6 w-full border-t border-white/10 pt-6">
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-200">
              <ShieldCheck size={13} aria-hidden="true" />
              Your session is safe
            </div>
            <h2 className="mt-4 text-base font-semibold text-white">Still loading your market data</h2>
            <p className="mx-auto mt-2 max-w-[17rem] text-xs leading-5 text-slate-400">
              You can keep waiting, reload the session, or return to your dashboard without losing progress.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 text-xs font-bold text-surface-950 shadow-[0_8px_24px_-12px_rgba(34,195,160,0.8)] transition hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <RefreshCw size={14} aria-hidden="true" />
                Reload session
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/app")}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Dashboard
              </button>
            </div>
            <p className="mt-4 text-[10px] leading-4 text-slate-500">
              Loading continues while this message is shown.
            </p>
          </div>
        )}

        {!showRecovery && (
          <div className="mt-6 w-full border-t border-white/10 pt-5" aria-hidden="true">
            <blockquote
              key={quoteIndex}
              className="page-loader-quote min-h-10 text-sm font-medium leading-5 text-slate-300"
            >
              “{MARKET_QUOTES[quoteIndex]}”
            </blockquote>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300/70">
              Market mindset
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
