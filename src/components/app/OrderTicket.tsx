"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, X } from "lucide-react";

import type { OrderRequest, PublicSessionState, TradeDirection } from "@/lib/backtest/types";

interface OrderTicketProps {
  state: PublicSessionState;
  busy: boolean;
  stopLoss: string | null;
  takeProfit: string | null;
  onPlaceOrder: (order: OrderRequest) => void;
  onClose: () => void;
  referencePair?: string | null;
}

export function OrderTicket({
  state,
  busy,
  stopLoss,
  takeProfit,
  onPlaceOrder,
  onClose,
  referencePair = null,
}: OrderTicketProps) {
  const [sizingMode, setSizingMode] = useState<"risk-percent" | "fixed-lots">("fixed-lots");
  const [riskPercent, setRiskPercent] = useState("1");
  const [lots, setLots] = useState("0.10");
  const [mobileDetails, setMobileDetails] = useState(false);
  const hasPosition = state.openPosition !== null;
  const finished = state.status === "finished";

  function submit(direction: TradeDirection) {
    onPlaceOrder({
      direction,
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
      stopLoss: stopLoss ?? undefined,
      takeProfit: takeProfit ?? undefined,
    });
  }

  const equityTone =
    Number(state.equity) >= Number(state.config.startingBalance)
      ? "text-brand-300"
      : "text-bear";

  return (
    <div className="overflow-x-auto border-b app-border bg-[var(--app-panel)] p-1.5">
      <div className="flex min-w-max items-center gap-2">
        {referencePair && (
          <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            Reference chart: {referencePair}. Switch to {state.config.symbol} to place orders.
          </div>
        )}
        {hasPosition && state.openPosition ? (
          <>
            <div className={`rounded-lg border px-3 py-2 ${
              state.openPosition.direction === "long"
                ? "border-brand-400/35 bg-brand-400/10 text-brand-300"
                : "border-bear/35 bg-bear/10 text-bear"
            }`}>
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider">
                {state.openPosition.direction === "long" ? "Long" : "Short"}
              </span>
              <span className="font-mono text-sm font-semibold">
                {state.openPosition.lots} lots @ {state.openPosition.entryPrice}
              </span>
            </div>
            <div className="rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Floating P/L</span>
              <span className={`font-mono text-sm font-semibold ${
                Number(state.openPosition.unrealizedPnl) >= 0 ? "text-brand-300" : "text-bear"
              }`}>
                ${state.openPosition.unrealizedPnl}
              </span>
            </div>
            <span className="text-xs app-muted">Drag SL/TP directly on the chart</span>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-bear/40 bg-bear/10 px-4 text-sm font-semibold text-bear hover:bg-bear/20 disabled:opacity-40"
            >
              <X size={15} aria-hidden />
              Close position
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => submit("long")}
              disabled={busy || finished || !state.currentPrice || Boolean(referencePair)}
              aria-disabled={Boolean(referencePair)}
              className="inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-bold text-surface-950 hover:bg-brand-400 disabled:opacity-40"
            >
              <ArrowUpRight size={17} aria-hidden />
              Buy
            </button>
            <button
              type="button"
              onClick={() => submit("short")}
              disabled={busy || finished || !state.currentPrice || Boolean(referencePair)}
              aria-disabled={Boolean(referencePair)}
              className="inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-md bg-bear px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              <ArrowDownRight size={17} aria-hidden />
              Sell
            </button>
            <button
              type="button"
              onClick={() => setMobileDetails((open) => !open)}
              className="inline-flex h-9 items-center gap-1 rounded-md border app-border px-3 text-xs font-semibold sm:hidden"
              aria-expanded={mobileDetails}
            >
              Size <ChevronDown size={13} aria-hidden />
            </button>
            <div className={`${mobileDetails ? "flex" : "hidden"} h-9 items-center rounded-md border app-border p-1 sm:flex`}>
              {(["fixed-lots", "risk-percent"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSizingMode(mode)}
                  aria-pressed={sizingMode === mode}
                  className={`h-8 rounded-md px-3 text-xs font-semibold ${
                    sizingMode === mode ? "bg-brand-400/15 text-brand-300" : "app-muted"
                  }`}
                >
                  {mode === "fixed-lots" ? "Lots" : "Risk %"}
                </button>
              ))}
            </div>
            <label className={`${mobileDetails ? "flex" : "hidden"} h-9 items-center gap-2 rounded-md border app-border bg-[var(--app-panel-2)] px-3 sm:flex`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider app-muted">
                {sizingMode === "fixed-lots" ? "Size" : "Risk"}
              </span>
              <input
                className="w-16 bg-transparent font-mono text-sm outline-none"
                inputMode="decimal"
                value={sizingMode === "fixed-lots" ? lots : riskPercent}
                onChange={(event) =>
                  sizingMode === "fixed-lots"
                    ? setLots(event.target.value)
                    : setRiskPercent(event.target.value)
                }
                aria-label={sizingMode === "fixed-lots" ? "Lot size" : "Account risk percent"}
              />
              {sizingMode === "risk-percent" && <span className="text-xs app-muted">%</span>}
            </label>
            <span className={`${mobileDetails ? "inline" : "hidden"} text-xs app-muted sm:inline`}>
              {stopLoss ? `SL ${stopLoss}` : "Use chart SL"}
              {takeProfit ? ` · TP ${takeProfit}` : ""}
            </span>
          </>
        )}
        <div className="hidden rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 sm:block">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Balance</span>
          <span className="font-mono text-sm font-semibold">${state.balance}</span>
        </div>
        <div className="hidden rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 sm:block">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Equity</span>
          <span className={`font-mono text-sm font-semibold ${equityTone}`}>${state.equity}</span>
        </div>
        <div className="hidden rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 md:block">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Spread</span>
          <span className="font-mono text-sm font-semibold">{state.config.spreadPips} pips</span>
        </div>
      </div>
    </div>
  );
}
