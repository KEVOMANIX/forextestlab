"use client";

import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";

import {
  DEFAULT_LEVERAGE,
  marginRequired,
  pipValuePerLot,
} from "@/lib/backtest/position-sizing";
import type { PublicSessionState } from "@/lib/backtest/types";

/**
 * The order size, and what it commits, revealed on hover or focus.
 *
 * Wherever a Buy/Sell button can send an order — the chart's quote buttons and
 * the replay toolbox — the size it will send has to be visible and changeable
 * without opening the planner. With one-click trading on, a press *is* an order.
 *
 * Deliberately small. It hangs off a button that sits over the candles, so it
 * gets one row of controls, one row of presets, and one line of consequence:
 * what a pip is worth and what the broker holds. "0.10" tells a trader nothing
 * on its own, but neither does a panel that covers the chart to explain it.
 */

export const LOT_PRESETS = ["0.01", "0.10", "0.50", "1.00"];
export const LOT_STEP = 0.01;

export interface SizeSummary {
  lots: string;
  /** False for a non-numeric or non-positive size; blocks submission. */
  valid: boolean;
  /** Account-currency value of one pip at this size. */
  pipValue: number | null;
  /** Account-currency margin the broker holds at this size. */
  margin: number | null;
  /** True when a cross rate was approximated, as position sizing documents. */
  approx: boolean;
}

/**
 * What a fixed lot size commits at the current price.
 *
 * With no price there is no conversion, so both figures come back null and read
 * as "—" rather than being computed against a stand-in that would be wrong.
 */
export function sizeSummaryFor(
  state: PublicSessionState,
  lots: string,
): SizeSummary {
  const price = String(state.currentPrice ?? "");
  const perPip = pipValuePerLot({
    pipSize: state.config.pipSize,
    quoteCurrency: state.config.quoteCurrency,
    accountCurrency: state.config.accountCurrency,
    baseCurrency: state.config.baseCurrency,
    price,
    symbol: state.config.symbol,
  });
  const margin = marginRequired({
    lots,
    price,
    leverage: state.config.leverage ?? DEFAULT_LEVERAGE,
    accountCurrency: state.config.accountCurrency,
    baseCurrency: state.config.baseCurrency,
    quoteCurrency: state.config.quoteCurrency,
  });
  const lotsNumber = Number(lots);
  const perPipNumber = Number(perPip.value);
  return {
    lots,
    valid: Number.isFinite(lotsNumber) && lotsNumber > 0,
    pipValue:
      Number.isFinite(perPipNumber) && Number.isFinite(lotsNumber)
        ? perPipNumber * lotsNumber
        : null,
    margin: Number.isFinite(Number(margin.value)) ? Number(margin.value) : null,
    approx: perPip.approx || margin.approx,
  };
}

export function useSizeSummary(state: PublicSessionState, lots: string): SizeSummary {
  return useMemo(
    () => sizeSummaryFor(state, lots),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lots, state.config, state.currentPrice],
  );
}

function amount(value: number | null, currency: string, approx: boolean): string {
  if (value == null) return "—";
  return `${approx ? "≈" : ""}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function LotSizePopover({
  lots,
  onLots,
  summary,
  accountCurrency,
  equity,
  /**
   * Which side the panel hangs from. The replay toolbox floats in the middle of
   * the chart and its buttons sit at the right-hand end, so a left-anchored
   * panel would run off the toolbox.
   */
  align = "left",
  /** Above the button instead of below, for a control near the bottom edge. */
  placement = "below",
}: {
  lots: string;
  onLots: (lots: string) => void;
  summary: SizeSummary;
  accountCurrency: string;
  equity: string;
  align?: "left" | "right";
  placement?: "below" | "above";
}) {
  const step = (delta: number) => {
    const next = Math.max(LOT_STEP, (Number(lots) || 0) + delta);
    onLots(next.toFixed(2));
  };
  const marginShare =
    summary.margin != null && Number(equity) > 0
      ? Math.min(100, (summary.margin / Number(equity)) * 100)
      : null;

  return (
    <div
      className={`pointer-events-none absolute z-40 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${
        align === "left" ? "left-0" : "right-0"
      } ${placement === "below" ? "top-full pt-1" : "bottom-full pb-1"}`}
      data-testid="quick-lot-size"
    >
      <div className="w-[172px] rounded-md border border-[var(--ticket-border)] bg-[var(--ticket-bg)] p-1.5 text-[var(--ticket-text)] shadow-2xl">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-LOT_STEP)}
            aria-label="Decrease lot size"
            className="grid h-6 w-6 shrink-0 place-items-center rounded border border-[var(--ticket-border)] text-[var(--ticket-muted)] transition-colors hover:border-brand-400/50 hover:text-[var(--ticket-text)]"
          >
            <Minus size={11} aria-hidden />
          </button>
          <input
            value={lots}
            onChange={(event) => onLots(event.target.value)}
            inputMode="decimal"
            aria-label="Order size in lots"
            className={`h-6 min-w-0 flex-1 rounded border bg-transparent px-1 text-center font-mono text-xs font-bold outline-none ${
              summary.valid
                ? "border-[var(--ticket-field-border)] focus:border-brand-400"
                : "border-bear text-bear"
            }`}
          />
          <button
            type="button"
            onClick={() => step(LOT_STEP)}
            aria-label="Increase lot size"
            className="grid h-6 w-6 shrink-0 place-items-center rounded border border-[var(--ticket-border)] text-[var(--ticket-muted)] transition-colors hover:border-brand-400/50 hover:text-[var(--ticket-text)]"
          >
            <Plus size={11} aria-hidden />
          </button>
        </div>

        <div className="mt-1 grid grid-cols-4 gap-0.5">
          {LOT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onLots(preset)}
              aria-pressed={lots === preset}
              className={`h-5 rounded font-mono text-[10px] font-semibold transition-colors ${
                lots === preset
                  ? "bg-brand-500 text-surface-950"
                  : "bg-[var(--ticket-raised)] text-[var(--ticket-muted)] hover:text-[var(--ticket-text)]"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Two figures on one line each: at this width a definition list with
            its own rows cost more height than the numbers were worth. */}
        <dl className="mt-1 flex items-center justify-between gap-1 border-t border-[var(--ticket-border)] pt-1 text-[10px]">
          <div className="min-w-0">
            <dt className="text-[var(--ticket-subtle)]">Pip</dt>
            <dd className="truncate font-mono font-semibold">
              {amount(summary.pipValue, accountCurrency, summary.approx)}
            </dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-[var(--ticket-subtle)]">
              Margin
              {marginShare != null && (
                <span className="ml-1">
                  ({marginShare.toFixed(marginShare < 10 ? 1 : 0)}%)
                </span>
              )}
            </dt>
            <dd className="truncate font-mono font-semibold">
              {amount(summary.margin, accountCurrency, summary.approx)}
            </dd>
          </div>
        </dl>

        {!summary.valid && (
          <p role="alert" className="mt-1 text-[10px] text-bear">
            Enter a size above zero.
          </p>
        )}
      </div>
    </div>
  );
}
