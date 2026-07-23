"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarPlus,
  Check,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { newYorkDateEnd, toNewYorkDateInput } from "@/lib/date-time";

function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
}

function addDays(timestamp: number, days: number): number {
  return timestamp + days * 24 * 60 * 60 * 1000;
}

export function EndOfDataModal({
  open,
  currentEndTime,
  sessionStartTime,
  maxSessionDays,
  isTrial,
  busy,
  error,
  onAddData,
  onFinish,
}: {
  open: boolean;
  currentEndTime: number;
  sessionStartTime: number;
  maxSessionDays: number | null;
  isTrial: boolean;
  busy: boolean;
  error: string | null;
  onAddData: (endTime: number) => Promise<boolean>;
  onFinish: () => void;
}) {
  const minimum = useMemo(
    () => toNewYorkDateInput(addDays(currentEndTime, 1)),
    [currentEndTime],
  );
  const maximum = useMemo(
    () =>
      maxSessionDays === null
        ? undefined
        : toNewYorkDateInput(
            addDays(sessionStartTime, maxSessionDays - 1),
          ),
    [maxSessionDays, sessionStartTime],
  );
  const suggested = useMemo(() => {
    const nextMonth = toNewYorkDateInput(addMonths(currentEndTime, 1));
    return maximum && nextMonth > maximum ? maximum : nextMonth;
  }, [currentEndTime, maximum]);
  const [date, setDate] = useState(suggested);

  useEffect(() => {
    if (open) setDate(suggested);
  }, [open, suggested]);

  if (!open) return null;

  const canExtend = Boolean(date && date >= minimum && (!maximum || date <= maximum));

  if (isTrial) {
    return (
      <div className="fixed inset-0 z-[1100] grid place-items-center bg-surface-950/85 p-4 backdrop-blur-md">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="trial-complete-title"
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-brand-400/25 bg-[var(--app-panel)] shadow-2xl"
        >
          <div className="relative overflow-hidden p-6 sm:p-8">
            <div
              aria-hidden
              className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand-400/15 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-400/15 text-brand-300">
                  <Sparkles size={22} aria-hidden />
                </span>
                <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-brand-300">
                  Trial complete
                </span>
              </div>

              <h2
                id="trial-complete-title"
                className="mt-5 text-2xl font-bold tracking-tight"
              >
                You completed your EUR/USD trial
              </h2>
              <p className="mt-2 text-sm leading-6 app-muted">
                Your trades and results are saved. Upgrade to continue building
                your testing record with custom markets, dates, and deeper analytics.
              </p>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {[
                  "Create more saved sessions",
                  "Choose markets and dates",
                  "Unlock complete analytics",
                  "Continue with more data",
                ].map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)]/55 px-3 py-2.5 text-xs font-medium"
                  >
                    <Check size={14} className="shrink-0 text-brand-300" aria-hidden />
                    {feature}
                  </div>
                ))}
              </div>
              {error && (
                <p role="alert" className="mt-4 text-sm text-bear">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t app-border bg-[var(--app-panel-2)]/55 px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onFinish}
              disabled={busy}
              className="btn-secondary px-4 py-2.5"
            >
              <BarChart3 size={15} aria-hidden />
              Finish &amp; view analytics
            </button>
            <Link
              href="/pricing?from=trial-complete"
              className="btn-primary px-4 py-2.5"
            >
              View upgrade plans
              <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-surface-950/80 p-4 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-of-data-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-2xl"
      >
        <div className="p-6 sm:p-7">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-400/10 text-brand-300">
            <CheckCircle2 size={23} aria-hidden />
          </span>
          <h2 id="end-of-data-title" className="mt-5 text-xl font-semibold">
            You reached the end of this session
          </h2>
          <p className="mt-2 text-sm leading-6 app-muted">
            Extend the date range to continue replaying this market, or finish
            the session and review your analytics.
          </p>

          <div className="mt-6 rounded-xl border app-border bg-[var(--app-panel-2)]/65 p-4">
            <label htmlFor="extended-session-date" className="text-xs font-semibold uppercase tracking-[0.12em] app-muted">
              Continue replay until
            </label>
            <div className="relative mt-2">
              <CalendarPlus
                size={17}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-300"
              />
              <input
                id="extended-session-date"
                type="date"
                value={date}
                min={minimum}
                max={maximum}
                onChange={(event) => setDate(event.target.value)}
                disabled={busy || Boolean(maximum && maximum < minimum)}
                className="app-input w-full pl-10"
              />
            </div>
            {maximum && maximum < minimum && (
              <p className="mt-2 text-xs text-amber-300">
                This session has reached the date range included with your current plan.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-bear">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t app-border bg-[var(--app-panel-2)]/55 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onFinish}
            disabled={busy}
            className="btn-secondary px-4 py-2.5"
          >
            Finish &amp; view analytics
          </button>
          <button
            type="button"
            disabled={busy || !canExtend}
            onClick={() => void onAddData(newYorkDateEnd(date))}
            className="btn-primary min-w-36 px-4 py-2.5"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Loading data…
              </>
            ) : (
              "Add more data"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
