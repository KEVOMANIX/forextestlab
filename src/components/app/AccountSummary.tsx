"use client";

import { useMemo } from "react";

import { d } from "@/lib/decimal";
import { BREACH_LABELS, propFirmProgress } from "@/lib/backtest/prop-firm";
import { DEFAULT_LEVERAGE, marginRequired } from "@/lib/backtest/position-sizing";
import type { PublicSessionState } from "@/lib/backtest/types";

/**
 * Account read-out for the session status bar: what the account is worth, what
 * it has made, and what is currently tied up in margin.
 *
 * Realized and unrealized are shown apart because they answer different
 * questions — realized is the record, unrealized is exposure that can still
 * evaporate. Together they equal equity minus the starting balance.
 *
 * In a prop-firm session the challenge limits join the same strip, and take
 * priority over margin and the split P&L. They belong here rather than in a bar
 * of their own: they are account state, read at the same glance as equity, and
 * a second bar would cost chart height to say something this strip was already
 * the right home for. Because space is finite, the breakpoints reorder rather
 * than simply appending — how close the account is to failing outranks how much
 * margin is tied up.
 */

const BEAR_TONE = "text-bear";

function money(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signedMoney(value: number): string {
  // Values within half a cent are neither a gain nor a loss; show a plain zero.
  if (Math.abs(value) < 0.005) return money(0);
  return `${value > 0 ? "+" : "-"}${money(Math.abs(value))}`;
}

function toneClass(value: number): string {
  if (Math.abs(value) < 0.005) return "text-[var(--app-text)]";
  return value > 0 ? "text-brand-300" : "text-bear";
}

/**
 * Margin held against every open position, in the account currency.
 *
 * Computed at each position's entry price, the convention retail platforms use:
 * margin is taken when the position opens and does not float with price.
 */
export function accountMargin(state: PublicSessionState): number {
  let total = d(0);
  for (const position of state.openPositions) {
    const { value } = marginRequired({
      lots: position.lots,
      price: position.entryPrice,
      leverage: state.config.leverage ?? DEFAULT_LEVERAGE,
      accountCurrency: state.config.accountCurrency,
      baseCurrency: state.config.baseCurrency,
      quoteCurrency: state.config.quoteCurrency,
    });
    if (Number.isFinite(Number(value))) total = total.plus(value);
  }
  return Number(total.toFixed(2));
}

export function AccountSummary({
  state,
  clock = null,
  onShowVerdict,
}: {
  state: PublicSessionState;
  /** Session clock, shown ahead of the balances. */
  clock?: React.ReactNode;
  /** Opens the challenge verdict. Only used in a prop-firm session. */
  onShowVerdict?: () => void;
}) {
  const metrics = useMemo(() => {
    const balance = Number(state.balance);
    const equity = Number(state.equity);
    return {
      balance,
      equity,
      realized: balance - Number(state.config.startingBalance),
      unrealized: equity - balance,
      margin: accountMargin(state),
    };
  }, [state]);

  const rules = state.config.propFirm;
  const runtime = state.propFirm;
  const challenge =
    rules && runtime
      ? propFirmProgress({
          rules,
          startingBalance: state.config.startingBalance,
          equity: state.equity,
          peakEquity: state.maxEquity,
          runtime,
        })
      : null;
  const breach = runtime?.breach ?? null;

  return (
    <dl
      className="flex h-full shrink-0 items-center gap-2.5 px-2 sm:gap-4 sm:px-3 xl:gap-6"
      aria-label="Account summary"
    >
      {clock}

      {challenge && rules && (
        <>
          <button
            type="button"
            onClick={onShowVerdict}
            aria-label="Challenge status"
            className="flex flex-col justify-center gap-0.5 rounded leading-none hover:opacity-80"
          >
            <dt className="text-[10px] font-medium app-muted">Phase {challenge.phase}</dt>
            <dd
              className={`font-mono text-xs font-semibold ${
                breach
                  ? BEAR_TONE
                  : challenge.status === "passed"
                    ? "text-brand-300"
                    : "text-[var(--app-text)]"
              }`}
            >
              {breach ? "Breached" : challenge.status === "passed" ? "Passed" : "Active"}
            </dd>
          </button>

          {/*
            Headroom on a breached account reads as though there is still room to
            trade. Once the run is over the two limits give way to the rule that
            ended it; the verdict holds the detail.
          */}
          {breach ? (
            <Metric
              label="Failed on"
              value={BREACH_LABELS[breach.rule]}
              tone={BEAR_TONE}
            />
          ) : (
            <>
              <Metric
                label="Daily left"
                value={money(Number(challenge.dailyRemaining))}
                tone={limitTone(challenge.dailyUsedRatio)}
              />
              <Metric
                label="Total left"
                value={money(Number(challenge.totalRemaining))}
                tone={limitTone(challenge.totalUsedRatio)}
                className="hidden md:flex"
              />
            </>
          )}
          <Metric
            label={`Target ${rules.profitTargetPercent}%`}
            value={`${challenge.profitPercent >= 0 ? "+" : ""}${challenge.profitPercent.toFixed(2)}%`}
            tone={challenge.targetMet ? "text-brand-300" : "text-[var(--app-text)]"}
            className="hidden lg:flex"
          />
        </>
      )}

      <Metric
        label="Equity"
        value={money(metrics.equity)}
        className={challenge ? "hidden md:flex" : "flex"}
      />
      <Metric
        label="Account balance"
        value={money(metrics.balance)}
        className={challenge ? "hidden lg:flex" : "flex"}
      />
      <Metric
        label="Realized PnL"
        value={signedMoney(metrics.realized)}
        tone={toneClass(metrics.realized)}
        className={challenge ? "hidden xl:flex" : "hidden lg:flex"}
      />
      <Metric
        label="Unrealized PnL"
        value={signedMoney(metrics.unrealized)}
        tone={toneClass(metrics.unrealized)}
        className="hidden xl:flex"
      />
      <Metric
        label="Account margin"
        value={money(metrics.margin)}
        className="hidden 2xl:flex"
      />
    </dl>
  );
}

/** Green with room, amber past half the allowance, red past four fifths. */
function limitTone(usedRatio: number): string {
  if (usedRatio >= 0.8) return BEAR_TONE;
  if (usedRatio >= 0.5) return "text-[var(--app-warn-text)]";
  return "text-brand-300";
}

function Metric({
  label,
  value,
  tone = "text-[var(--app-text)]",
  className = "flex",
}: {
  label: string;
  value: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`${className} flex-col justify-center gap-0.5 leading-none`}>
      <dt className="text-[10px] font-medium app-muted">{label}</dt>
      <dd className={`font-mono text-xs font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}
