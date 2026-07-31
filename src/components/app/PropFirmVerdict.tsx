"use client";

import { createPortal } from "react-dom";
import { ShieldCheck, ShieldX } from "lucide-react";

import {
  BREACH_LABELS,
  propFirmProgress,
  type PropFirmRules,
  type PropFirmRuntime,
} from "@/lib/backtest/prop-firm";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

/**
 * The verdict on a challenge: passed, or which rule ended it and where.
 *
 * A breach names the candle and the equity that broke the line, because "you
 * failed" is not useful feedback — "your floating loss hit 94,180 at 14:32 on
 * the 6th, against a 95,000 floor" is something you can go and look at.
 */

function formatMoment(at: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
  } catch {
    return new Date(at).toISOString();
  }
}

export function PropFirmVerdict({
  rules,
  runtime,
  startingBalance,
  equity,
  peakEquity,
  accountCurrency,
  onClose,
}: {
  rules: PropFirmRules;
  runtime: PropFirmRuntime;
  startingBalance: string;
  equity: string;
  peakEquity: string;
  accountCurrency: string;
  onClose: () => void;
}) {
  const dialogRef = useModalBehavior<HTMLDivElement>({ open: true, onClose });
  const progress = propFirmProgress({
    rules,
    startingBalance,
    equity,
    peakEquity,
    runtime,
  });
  const breach = runtime.breach;
  const passed = runtime.status === "passed";

  return createPortal(
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Challenge verdict"
        tabIndex={-1}
        data-testid="prop-firm-verdict"
        className="w-[min(30rem,100%)] overflow-hidden rounded-xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
      >
        <header className="flex items-center gap-3 border-b app-border px-5 py-4">
          {breach ? (
            <ShieldX size={22} className="shrink-0 text-bear" aria-hidden />
          ) : (
            <ShieldCheck
              size={22}
              className="shrink-0"
              style={{ color: "var(--app-accent-text)" }}
              aria-hidden
            />
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {breach
                ? `${BREACH_LABELS[breach.rule]} breached`
                : passed
                  ? `Phase ${rules.phase} passed`
                  : `Phase ${rules.phase} in progress`}
            </h2>
            <p className="text-xs app-muted">
              {breach
                ? "The challenge is over. The account was flattened at the breach."
                : passed
                  ? "Every requirement is met. You can keep trading the remaining data."
                  : "Nothing has been breached yet."}
            </p>
          </div>
        </header>

        <div className="space-y-3 p-5">
          {breach && (
            <dl className="space-y-1.5 rounded-lg bg-[var(--app-panel-2)] p-3 text-xs">
              <Row label="Rule" value={BREACH_LABELS[breach.rule]} />
              <Row
                label="When"
                value={formatMoment(breach.at, rules.dailyResetZone)}
              />
              <Row
                label="Equity"
                value={`${Number(breach.equity).toFixed(2)} ${accountCurrency}`}
                tone="bad"
              />
              <Row
                label="Limit"
                value={`${Number(breach.limit).toFixed(2)} ${accountCurrency}`}
              />
            </dl>
          )}

          <dl className="space-y-1.5 rounded-lg border app-border p-3 text-xs">
            <Row
              label={`Profit target (${rules.profitTargetPercent}%)`}
              value={`${progress.profitPercent >= 0 ? "+" : ""}${progress.profitPercent.toFixed(2)}%`}
              tone={progress.targetMet ? "good" : undefined}
            />
            <Row
              label="Trading days"
              value={
                rules.minTradingDays > 0
                  ? `${progress.tradingDays} / ${rules.minTradingDays}`
                  : String(progress.tradingDays)
              }
            />
            {/*
              Headroom is only meaningful while the challenge is live. On a
              breached account "4,550 left" reads as though there is still room,
              when the run is already over — the breach block above is the
              number that matters.
            */}
            {!breach && (
              <>
                <Row
                  label={`Daily loss limit (${rules.maxDailyLossPercent}%)`}
                  value={`${Number(progress.dailyRemaining).toFixed(2)} left`}
                />
                <Row
                  label={`Maximum loss (${rules.maxTotalLossPercent}%)`}
                  value={`${Number(progress.totalRemaining).toFixed(2)} left`}
                />
              </>
            )}
          </dl>
        </div>

        <footer className="flex justify-end gap-2 border-t app-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-brand-500 px-4 py-1.5 text-[13px] font-semibold text-surface-950 hover:bg-brand-400"
          >
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="app-muted">{label}</dt>
      <dd
        className={`font-mono font-semibold ${tone === "bad" ? "text-bear" : ""}`}
        style={tone === "good" ? { color: "var(--app-accent-text)" } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
