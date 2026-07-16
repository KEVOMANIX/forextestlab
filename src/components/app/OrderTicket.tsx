"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";

import { calculatePositionSize } from "@/lib/backtest/position-sizing";
import type { OrderRequest, PublicSessionState, TradeDirection } from "@/lib/backtest/types";
import { getSymbolDefinition } from "@/lib/market-data/symbols";

interface OrderTicketProps {
  state: PublicSessionState;
  busy: boolean;
  onPlaceOrder: (order: OrderRequest) => void;
  onClose: () => void;
}

function Stat({
  label,
  value,
  tone = "",
  prominent = false,
}: {
  label: string;
  value: string;
  tone?: string;
  prominent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">
        {label}
      </p>
      <p className={`mt-0.5 truncate font-mono font-semibold ${prominent ? "text-lg" : "text-sm"} ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">
        {label}
      </span>
      <input
        className="app-input h-10 w-full min-w-0 font-mono text-sm"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      />
    </label>
  );
}

export function OrderTicket({ state, busy, onPlaceOrder, onClose }: OrderTicketProps) {
  const [sizingMode, setSizingMode] = useState<"risk-percent" | "fixed-lots">("risk-percent");
  const [riskPercent, setRiskPercent] = useState("1");
  const [lots, setLots] = useState("0.10");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const def = getSymbolDefinition(state.config.symbol);
  const price = state.currentPrice;
  const hasPosition = state.openPosition !== null;
  const finished = state.status === "finished";

  const preview = useMemo(() => {
    if (!price || !def) return null;
    try {
      return calculatePositionSize({
        accountBalance: state.balance,
        accountCurrency: state.config.accountCurrency,
        riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
        entryPrice: price,
        stopLoss: stopLoss || undefined,
        pipSize: state.config.pipSize,
        symbol: state.config.symbol,
        quoteCurrency: state.config.quoteCurrency,
        baseCurrency: state.config.baseCurrency,
        fixedLots: sizingMode === "fixed-lots" ? lots : undefined,
      });
    } catch {
      return null;
    }
  }, [price, def, state.balance, state.config, sizingMode, riskPercent, stopLoss, lots]);

  function submit(direction: TradeDirection) {
    onPlaceOrder({
      direction,
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
      stopLoss: stopLoss || undefined,
      takeProfit: takeProfit || undefined,
    });
  }

  const equityTone =
    Number(state.equity) >= Number(state.config.startingBalance)
      ? "text-brand-300"
      : "text-bear";

  return (
    <div className="panel p-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(360px,0.8fr)_minmax(640px,1.5fr)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
          <Stat label="Market price" value={price ?? "—"} prominent />
          <Stat label="Spread" value={`${state.config.spreadPips} pips`} />
          <Stat label="Balance" value={`$${state.balance}`} />
          <Stat label="Equity" value={`$${state.equity}`} tone={equityTone} />
        </div>

        {hasPosition && state.openPosition ? (
          <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <Stat
              label="Open position"
              value={`${state.openPosition.direction === "long" ? "LONG" : "SHORT"} · ${state.openPosition.lots} lots`}
              tone={state.openPosition.direction === "long" ? "text-brand-300" : "text-bear"}
            />
            <Stat label="Entry" value={state.openPosition.entryPrice} />
            <Stat label="Stop-loss" value={state.openPosition.stopLoss ?? "—"} />
            <Stat label="Take-profit" value={state.openPosition.takeProfit ?? "—"} />
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-bear/40 bg-bear/10 px-5 text-sm font-semibold text-bear transition-colors hover:bg-bear/20 disabled:opacity-40"
            >
              <X size={16} aria-hidden />
              Close position
              <span className="font-mono">{state.openPosition.unrealizedPnl}</span>
            </button>
          </div>
        ) : (
          <div className="grid items-end gap-2 md:grid-cols-2 xl:grid-cols-[170px_120px_1fr_1fr_minmax(132px,0.8fr)_132px_132px]">
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">
                Position sizing
              </span>
              <div className="grid h-10 grid-cols-2 gap-1 rounded-lg border app-border p-1">
                {(["risk-percent", "fixed-lots"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSizingMode(mode)}
                    aria-pressed={sizingMode === mode}
                    className={`rounded-md px-2 text-xs font-semibold transition-colors ${
                      sizingMode === mode
                        ? "bg-brand-400/15 text-brand-300"
                        : "app-muted hover:text-brand-300"
                    }`}
                  >
                    {mode === "risk-percent" ? "Risk %" : "Lots"}
                  </button>
                ))}
              </div>
            </div>

            {sizingMode === "risk-percent" ? (
              <Field
                label="Risk (%)"
                value={riskPercent}
                onChange={setRiskPercent}
                ariaLabel="Account risk percent"
              />
            ) : (
              <Field
                label="Lot size"
                value={lots}
                onChange={setLots}
                ariaLabel="Lot size"
              />
            )}

            <Field
              label="Stop-loss"
              value={stopLoss}
              onChange={setStopLoss}
              ariaLabel="Stop-loss price"
              placeholder="Optional price"
            />
            <Field
              label="Take-profit"
              value={takeProfit}
              onChange={setTakeProfit}
              ariaLabel="Take-profit price"
              placeholder="Optional price"
            />

            <div className="flex min-h-10 items-center rounded-lg border app-border bg-[var(--app-panel-2)] px-3">
              {preview ? (
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold">
                    {preview.lots} lots · ${preview.riskAmount} risk
                  </p>
                  <p className="truncate text-[10px] app-muted">
                    {preview.maxExpectedLoss === "Not available"
                      ? "Add a stop-loss for max loss"
                      : `Max loss $${preview.maxExpectedLoss}`}
                  </p>
                </div>
              ) : (
                <p className="text-xs app-muted">Add a valid stop for risk preview</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => submit("long")}
              disabled={busy || finished || !price}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-base font-bold text-surface-950 shadow-lg shadow-brand-500/15 transition hover:bg-brand-400 disabled:opacity-40"
            >
              <ArrowUpRight size={19} aria-hidden />
              Buy
            </button>
            <button
              type="button"
              onClick={() => submit("short")}
              disabled={busy || finished || !price}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-bear px-4 text-base font-bold text-white shadow-lg shadow-bear/15 transition hover:opacity-90 disabled:opacity-40"
            >
              <ArrowDownRight size={19} aria-hidden />
              Sell
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
