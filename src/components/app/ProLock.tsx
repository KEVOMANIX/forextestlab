"use client";

import Link from "next/link";
import { useRef } from "react";

/**
 * What each Pro-only feature gives, in the words the lock explains it with.
 * The server enforces every one of these; the lock only explains it.
 */
export const PRO_FEATURE_COPY = {
  challenge: {
    title: "Prop Firm Challenge mode",
    benefit: "Practise a funded-account evaluation under real rules: profit target, daily loss limit and maximum loss, scored day by day.",
  },
  multiPair: {
    title: "Multi-pair replay",
    benefit: "Replay several markets on one synchronised clock and trade all of them, the way you watch the market live.",
  },
  markets: {
    title: "All 38 markets",
    benefit: "Every FX cross, gold and silver, US indices, crypto and the dollar index, on top of the seven majors.",
  },
  history: {
    title: "Full history",
    benefit: "Sessions longer than 31 days, across the full history available for each market.",
  },
  speed: {
    title: "All replay speeds",
    benefit: "Replay up to 2 hours of market time a second to get through long periods fast.",
  },
  analytics: {
    title: "Full analytics",
    benefit: "Advanced reports: risk, timing and exit-quality analysis across your trades.",
  },
  ai: {
    title: "AI insights",
    benefit: "An AI analyst that reads your trades and points out what is working and what is costing you.",
  },
  exports: {
    title: "Trade and analytics exports",
    benefit: "Download your trades as CSV for your own spreadsheets and journals.",
  },
  sessions: {
    title: "Unlimited sessions",
    benefit: "Start as many sessions as you like, every month.",
  },
} as const;

export type ProFeature = keyof typeof PRO_FEATURE_COPY;

/**
 * A visible "🔒 Pro" control for a Pro-only feature. Opening it explains what
 * the feature gives and how to get it. Rendered only for Free accounts; during
 * a Pro trial the feature is simply unlocked.
 */
export function ProLock({ feature, className = "", label = "Pro" }: { feature: ProFeature; className?: string; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const copy = PRO_FEATURE_COPY[feature];
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dialog.current?.showModal();
        }}
        aria-haspopup="dialog"
        aria-label={`${copy.title} is part of Pro. Learn more`}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${className}`}
      >
        <span aria-hidden="true">🔒</span> {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`pro-lock-${feature}-title`}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border app-border bg-[var(--app-panel-solid)] p-0 text-[var(--app-text)] shadow-2xl backdrop:bg-black/60"
      >
        <div className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200"><span aria-hidden="true">🔒</span> Pro feature</p>
          <h2 id={`pro-lock-${feature}-title`} className="mt-2 text-lg font-semibold">{copy.title}</h2>
          <p className="mt-2 text-sm leading-6 app-muted">{copy.benefit}</p>
          <p className="mt-4 rounded-xl bg-[var(--app-panel-2)] px-4 py-3 text-xs leading-5 app-muted">
            Pro unlocks every market and the full history, multi-pair replay, all speeds, full analytics with AI insights, exports and Prop Firm Challenge mode. New members can try it free for 7 days.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="btn-secondary px-4 py-2 text-sm">Not now</button>
            <Link href={`/pricing?feature=${feature}`} className="btn-primary px-4 py-2 text-sm">See Pro and the free trial</Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
