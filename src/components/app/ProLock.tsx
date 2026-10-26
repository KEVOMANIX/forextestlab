"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { Check, Lock, X } from "lucide-react";

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
    benefit: "Download your trades as CSV and your analytics as a PDF report, for your own spreadsheets and journals.",
  },
  share: {
    title: "Analytics share links",
    benefit: "Send a read-only link to a session's analytics to a mentor or friend, and switch it off whenever you like.",
  },
  sessions: {
    title: "Unlimited sessions",
    benefit: "Start as many sessions as you like, every month.",
  },
} as const;

export type ProFeature = keyof typeof PRO_FEATURE_COPY;

/**
 * A Pro-only control. Opening it slides in a side panel with the feature the
 * trader reached for pinned first, then everything else Pro includes, so the
 * chart or page behind stays in view. Rendered only for Free accounts; during
 * a Pro trial the feature is simply unlocked.
 *
 * Without children it is the small "🔒 Pro" pill; with children those become
 * the trigger and `className` styles it.
 */
export function ProLock({ feature, className = "", label = "Pro", children }: { feature: ProFeature; className?: string; label?: string; children?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const copy = PRO_FEATURE_COPY[feature];
  const rest = (Object.keys(PRO_FEATURE_COPY) as ProFeature[]).filter((key) => key !== feature);
  const close = () => dialog.current?.close();
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
        aria-label={children ? undefined : `${copy.title} is part of Pro. Learn more`}
        className={children ? className : `inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--app-text)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-bg)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${className}`}
      >
        {children ?? <><Lock size={10} strokeWidth={2.6} aria-hidden /> {label}</>}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`pro-lock-${feature}-title`}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="my-0 ml-auto mr-0 h-dvh max-h-dvh w-[min(100vw,24rem)] max-w-none border-0 border-l app-border bg-[var(--app-panel-solid)] p-0 text-[var(--app-text)] shadow-2xl backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b app-border px-5 py-4">
            <p className="text-[15px] font-semibold">ForexTestLab Pro</p>
            <button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"><X size={16} aria-hidden /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <section className="rounded-xl border border-brand-400/40 bg-brand-400/10 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-300">You tried to open</p>
              <h2 id={`pro-lock-${feature}-title`} className="mt-1 text-base font-semibold">{copy.title}</h2>
              <p className="mt-1 text-[13px] leading-5 app-muted">{copy.benefit}</p>
            </section>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] app-muted">Also in Pro</p>
            <ul className="mt-1">
              {rest.map((key) => (
                <li key={key} className="flex gap-2.5 border-t app-border py-2.5 first:border-t-0">
                  <Check size={14} strokeWidth={2.6} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                  <span className="min-w-0"><span className="block text-[13px] font-semibold">{PRO_FEATURE_COPY[key].title}</span><span className="block text-xs leading-5 app-muted">{PRO_FEATURE_COPY[key].benefit}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <footer className="border-t app-border px-5 py-4">
            <Link href={`/pricing?feature=${feature}`} onClick={close} className="btn-primary w-full py-2.5 text-sm">See Pro and the 7-day free trial</Link>
            <p className="mt-2 text-center text-[11px] app-muted">New members can try every Pro feature free for 7 days.</p>
          </footer>
        </div>
      </dialog>
    </>
  );
}

/**
 * A blurred look at a Pro-only area with one card on top that opens the Pro
 * panel. What sits behind the blur is decoration: hidden from assistive
 * technology and not interactive.
 */
export function ProPeek({ feature, title, text, children, className = "" }: { feature: ProFeature; title: string; text: string; children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div aria-hidden="true" inert className="pointer-events-none select-none opacity-50 blur-[3px] saturate-50">{children}</div>
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-transparent via-[var(--app-bg)]/30 to-[var(--app-bg)]/70 p-4">
        <div className="max-w-xs rounded-xl border app-border bg-[var(--app-panel-solid)]/95 px-5 py-4 text-center shadow-2xl">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 app-muted">{text}</p>
          <ProLock feature={feature} className="btn-primary mt-3 px-4 py-2 text-xs"><Lock size={13} aria-hidden /> Unlock with Pro</ProLock>
        </div>
      </div>
    </div>
  );
}
