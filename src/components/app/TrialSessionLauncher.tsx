"use client";

import Link from "next/link";
import { CalendarRange, Loader2, Play, ShieldCheck } from "lucide-react";

export function TrialSessionLauncher({
  remaining,
  busy,
  error,
  onStart,
}: {
  remaining: number;
  busy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  if (remaining <= 0) {
    return (
      <section className="panel mx-auto w-full max-w-2xl p-7 text-center sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-400/10 text-brand-300">
          <ShieldCheck size={22} aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold">Your device trial is complete</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed app-muted">
          You have completed all three trial sessions on this device. Choose a
          plan to create unlimited sessions with custom markets and dates.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/pricing" className="btn-primary">View plans</Link>
          <Link href="/app/history" className="btn-secondary">View saved sessions</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel mx-auto w-full max-w-3xl overflow-hidden">
      <div className="border-b app-border bg-[linear-gradient(135deg,rgba(34,195,160,.12),transparent_60%)] px-6 py-7 text-center sm:px-10 sm:py-9">
        <span className="mx-auto inline-flex rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-300">
          {remaining} of 3 trial sessions remaining
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
          Your EUR/USD replay is ready
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 app-muted">
          We will choose a random 31-day historical period and open the chart
          immediately. The dates are revealed when your session loads.
        </p>
      </div>

      <div className="grid gap-3 px-6 py-6 sm:grid-cols-2 sm:px-10">
        <div className="rounded-xl border app-border bg-[var(--app-panel-2)]/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] app-muted">Trial market</p>
          <p className="mt-2 font-mono text-lg font-bold">EUR / USD</p>
        </div>
        <div className="rounded-xl border app-border bg-[var(--app-panel-2)]/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] app-muted">Historical period</p>
          <p className="mt-2 flex items-center gap-2 font-semibold">
            <CalendarRange size={17} className="text-brand-300" aria-hidden />
            Random 31-day window
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-6 rounded-lg border border-bear/25 bg-bear/10 px-4 py-3 text-sm text-bear sm:mx-10">
          {error}
        </p>
      )}

      <div className="px-6 pb-7 pt-5 sm:px-10 sm:pb-9">
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="btn-primary mx-auto w-full max-w-sm py-3 shadow-glow"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Preparing your session…
            </>
          ) : (
            <>
              <Play size={16} aria-hidden />
              Start trial session
            </>
          )}
        </button>
      </div>
    </section>
  );
}
