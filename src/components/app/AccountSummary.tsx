"use client";

import { useMemo } from "react";

import { d } from "@/lib/decimal";
import { DEFAULT_LEVERAGE, marginRequired } from "@/lib/backtest/position-sizing";
import type { PublicSessionState } from "@/lib/backtest/types";

/**
 * Account read-out for the session status bar: what the account is worth, what
 * it has made, and what is currently tied up in margin.
 *
 * Realized and unrealized are shown apart because they answer different
 * questions — realized is the record, unrealized is exposure that can still
 * evaporate. Together they equal equity minus the starting balance.
 */

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

export function AccountSummary({ state }: { state: PublicSessionState }) {
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

  return (
    <dl
      className="flex h-full shrink-0 items-center gap-4 px-3 xl:gap-6"
      aria-label="Account summary"
    >
      <Metric label="Account balance" value={money(metrics.balance)} />
      <Metric label="Equity" value={money(metrics.equity)} className="hidden md:flex" />
      <Metric
        label="Realized PnL"
        value={signedMoney(metrics.realized)}
        tone={toneClass(metrics.realized)}
        className="hidden lg:flex"
      />
      <Metric
        label="Unrealized PnL"
        value={signedMoney(metrics.unrealized)}
        tone={toneClass(metrics.unrealized)}
        className="hidden xl:flex"
      />
      <Metric label="Account margin" value={money(metrics.margin)} className="hidden 2xl:flex" />
    </dl>
  );
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
