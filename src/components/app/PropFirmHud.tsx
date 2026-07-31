"use client";

import { useMemo } from "react";
import { ShieldCheck, ShieldX, Target } from "lucide-react";

import {
  BREACH_LABELS,
  propFirmProgress,
  type PropFirmRules,
  type PropFirmRuntime,
} from "@/lib/backtest/prop-firm";

/**
 * The challenge scoreboard, always on screen while a prop session runs.
 *
 * A challenge trader is not watching profit — they are watching distance to two
 * lines, and they are watching it constantly. So this shows headroom in account
 * currency first and percentages second, and the meters fill *towards* failure:
 * a bar that is nearly full is a bar that is nearly over.
 *
 * It is a bar above the chart rather than another floating card. The corners
 * are already spoken for — legend and ticket top-left, replay toolbox top-centre
 * — and something you are meant to glance at every few seconds should not be
 * covering candles or moving around.
 */

const BEAR = "#f4646c";

function currency(value: string, code: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${code}`;
}

/** Green until half spent, amber to 80%, red past it. */
function meterColor(used: number): string {
  if (used >= 0.8) return BEAR;
  if (used >= 0.5) return "var(--app-warn-text)";
  return "var(--app-accent-text)";
}

export function PropFirmHud({
  rules,
  runtime,
  startingBalance,
  equity,
  peakEquity,
  accountCurrency,
  onShowVerdict,
}: {
  rules: PropFirmRules;
  runtime: PropFirmRuntime;
  startingBalance: string;
  equity: string;
  peakEquity: string;
  accountCurrency: string;
  onShowVerdict: () => void;
}) {
  const progress = useMemo(
    () =>
      propFirmProgress({ rules, startingBalance, equity, peakEquity, runtime }),
    [rules, startingBalance, equity, peakEquity, runtime],
  );

  const breached = progress.status === "breached";
  const passed = progress.status === "passed";

  return (
    <section
      data-testid="prop-firm-hud"
      data-prop-firm-status={progress.status}
      aria-label="Challenge progress"
      className="flex shrink-0 items-stretch gap-3 overflow-x-auto border-b app-border bg-[var(--app-panel)] px-3 py-1.5 scroll-x-thin"
    >
      <button
        type="button"
        onClick={onShowVerdict}
        className="flex shrink-0 flex-col items-start justify-center rounded-md px-1 text-left hover:bg-[var(--app-panel-2)]"
        aria-label="Challenge status"
      >
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
          {breached ? (
            <ShieldX size={12} className="text-bear" aria-hidden />
          ) : passed ? (
            <ShieldCheck
              size={12}
              style={{ color: "var(--app-accent-text)" }}
              aria-hidden
            />
          ) : (
            <Target size={12} className="app-muted" aria-hidden />
          )}
          Phase {progress.phase}
        </span>
        <span
          className="text-[11px] font-semibold"
          style={{
            color: breached ? BEAR : passed ? "var(--app-accent-text)" : undefined,
          }}
        >
          {breached ? "Breached" : passed ? "Passed" : "In progress"}
        </span>
      </button>

      <span className="w-px shrink-0 bg-[var(--app-border)]" aria-hidden />

      {/*
        Once breached, headroom is a lie: the run is over, and "4,550 left"
        reads as though there is still room to trade. The two meters give way to
        what actually happened.
      */}
      {breached && runtime.breach ? (
        <div className="min-w-[11rem] shrink-0">
          <p className="text-[9px] uppercase tracking-wide app-muted">
            {BREACH_LABELS[runtime.breach.rule]}
          </p>
          <p className="font-mono text-[12px] font-semibold" style={{ color: BEAR }}>
            {currency(runtime.breach.equity, accountCurrency)}
          </p>
          <p className="text-[9px] app-muted">
            against {currency(runtime.breach.limit, accountCurrency)}
          </p>
        </div>
      ) : (
        <>
          <Meter
            label="Daily left"
            value={currency(progress.dailyRemaining, accountCurrency)}
            ratio={progress.dailyUsedRatio}
          />
          <Meter
            label="Total left"
            value={currency(progress.totalRemaining, accountCurrency)}
            ratio={progress.totalUsedRatio}
          />
        </>
      )}
      <Meter
        label={`Target ${rules.profitTargetPercent}%`}
        value={`${progress.profitPercent >= 0 ? "+" : ""}${progress.profitPercent.toFixed(2)}%`}
        ratio={progress.targetProgress}
        // The target meter fills towards success, so it stays on the accent.
        color="var(--app-accent-text)"
      />
      {rules.minTradingDays > 0 && (
        <Meter
          label="Days"
          value={`${progress.tradingDays} / ${rules.minTradingDays}`}
          ratio={Math.min(1, progress.tradingDays / rules.minTradingDays)}
          color="var(--app-accent-text)"
        />
      )}
    </section>
  );
}

function Meter({
  label,
  value,
  ratio,
  color,
}: {
  label: string;
  value: string;
  ratio: number;
  color?: string;
}) {
  const tone = color ?? meterColor(ratio);
  return (
    <div className="min-w-[5.5rem] shrink-0">
      <p className="text-[9px] uppercase tracking-wide app-muted">{label}</p>
      <p className="font-mono text-[12px] font-semibold" style={{ color: tone }}>
        {value}
      </p>
      <span
        aria-hidden
        className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[var(--app-panel-2)]"
      >
        <span
          className="block h-full rounded-full transition-[width] duration-200"
          style={{ width: `${Math.round(ratio * 100)}%`, background: tone }}
        />
      </span>
    </div>
  );
}
