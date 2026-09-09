"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Skull, Wallet } from "lucide-react";

import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { formatNewYorkDateTime } from "@/lib/date-time";
import type { AccountBlowout } from "@/lib/backtest/types";

/**
 * The blown-account prompt.
 *
 * Reaching zero equity is the one outcome a trader has to feel, so this is a
 * decision the replay stops for: fund the account and carry on from the same
 * candle, or end the session and read the report. It deliberately ignores
 * Escape — dismissing it would leave a paused replay with no equity and no
 * explanation of why nothing can be traded.
 */
export function AccountBlownModal({
  open,
  blowout,
  startingBalance,
  balance,
  deposited,
  accountCurrency,
  busy,
  error,
  onAddFunds,
  onFinish,
}: {
  open: boolean;
  blowout: AccountBlowout | null;
  startingBalance: string;
  /** Balance after the blowout — negative if the last fill overshot zero. */
  balance: string;
  /** Demo funds already added to this session. */
  deposited: string;
  accountCurrency: string;
  busy: boolean;
  error: string | null;
  onAddFunds: (amount: string) => void;
  onFinish: () => void;
}) {
  const dialogRef = useModalBehavior<HTMLElement>({ open, closeOnEscape: false });
  /**
   * Presets around the account this trader actually chose. A fixed ladder would
   * offer 1,000 to someone practising a 200,000 account and 100,000 to someone
   * practising a 1,000 one.
   */
  const presets = useMemo(() => {
    const start = Number(startingBalance);
    const base = Number.isFinite(start) && start > 0 ? start : 10_000;
    return [base * 0.25, base * 0.5, base].map((value) =>
      Math.max(1, Math.round(value)).toFixed(2),
    );
  }, [startingBalance]);
  const [amount, setAmount] = useState(presets[2] ?? "10000.00");

  useEffect(() => {
    if (open) setAmount(presets[2] ?? "10000.00");
  }, [open, presets]);

  if (!open) return null;

  const value = Number(amount);
  const canFund = Number.isFinite(value) && value > 0 && !busy;
  const depositedValue = Number(deposited);
  const currentBalance = Number(balance);
  // What the trader will actually be trading with. A blown account can close
  // below zero when the last fill overshot it, and the deficit comes out of the
  // top-up — saying "add 10,000" while handing over 4,600 would be a lie.
  const resultingBalance = canFund ? currentBalance + value : currentBalance;

  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-surface-950/85 p-4 backdrop-blur-md">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-blown-title"
        data-testid="account-blown-modal"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-bear/30 bg-[var(--app-panel)] shadow-2xl outline-none"
      >
        <div className="relative overflow-hidden p-6 sm:p-7">
          <div
            aria-hidden
            className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-bear/15 blur-3xl"
          />
          <div className="relative">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bear/15 text-bear">
              <Skull size={23} aria-hidden />
            </span>
            <h2 id="account-blown-title" className="mt-5 text-xl font-semibold">
              You blew this account
            </h2>
            <p className="mt-2 text-sm leading-6 app-muted">
              Equity reached zero
              {blowout
                ? ` on ${formatNewYorkDateTime(blowout.time, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
              , so every open position was closed and every resting order was
              cancelled. Add demo funds to carry on from this candle, or end the
              session and review what happened.
            </p>

            <div className="mt-6 rounded-xl border app-border bg-[var(--app-panel-2)]/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] app-muted">
                Add demo funds ({accountCurrency})
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    aria-pressed={amount === preset}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      amount === preset
                        ? "border-brand-400/50 bg-brand-400/10 text-brand-200"
                        : "app-border hover:border-brand-400/30"
                    }`}
                  >
                    {Number(preset).toLocaleString("en-US")}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Wallet size={16} className="shrink-0 text-brand-300" aria-hidden />
                <label htmlFor="account-top-up" className="sr-only">
                  Amount to add
                </label>
                <input
                  id="account-top-up"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={busy}
                  className="app-input min-w-0 flex-1 py-1.5 font-mono text-sm"
                />
              </div>
              <p className="mt-2 font-mono text-xs">
                Trading balance after this top-up:{" "}
                <span className={resultingBalance > 0 ? "font-semibold text-[var(--app-accent-text)]" : "font-semibold text-bear"}>
                  {resultingBalance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                {currentBalance < 0 && (
                  <span className="app-muted">
                    {" "}
                    (after clearing a{" "}
                    {Math.abs(currentBalance).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    deficit)
                  </span>
                )}
              </p>
              <p className="mt-2 text-[11px] app-muted">
                Simulated funds only. Your profit is still measured against
                everything you have put in
                {depositedValue > 0
                  ? ` — ${(Number(startingBalance) + depositedValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} so far`
                  : ""}
                .
              </p>
              {error && (
                <p role="alert" className="mt-3 text-sm text-bear">
                  {error}
                </p>
              )}
            </div>
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
            End session &amp; review
          </button>
          <button
            type="button"
            disabled={!canFund}
            onClick={() => onAddFunds(amount)}
            className="btn-primary min-w-36 px-4 py-2.5"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Adding funds…
              </>
            ) : (
              "Add funds & continue"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
