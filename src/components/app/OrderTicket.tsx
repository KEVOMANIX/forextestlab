"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";

import type { OrderRequest, PublicSessionState, TradeDirection } from "@/lib/backtest/types";

interface OrderTicketProps {
  state: PublicSessionState;
  busy: boolean;
  stopLoss: string | null;
  takeProfit: string | null;
  onPlaceOrder: (order: OrderRequest) => void;
  onClose: () => void;
}

export function OrderTicket({
  state,
  busy,
  stopLoss,
  takeProfit,
  onPlaceOrder,
  onClose,
}: OrderTicketProps) {
  const [sizingMode, setSizingMode] = useState<"risk-percent" | "fixed-lots">("fixed-lots");
  const [riskPercent, setRiskPercent] = useState("1");
  const [lots, setLots] = useState("0.10");
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
    <div className="panel overflow-x-auto p-2">
      <div className="flex min-w-max items-center gap-2">
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
              disabled={busy || finished || !state.currentPrice}
              className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-bold text-surface-950 hover:bg-brand-400 disabled:opacity-40"
            >
              <ArrowUpRight size={17} aria-hidden />
              Buy
            </button>
            <button
              type="button"
              onClick={() => submit("short")}
              disabled={busy || finished || !state.currentPrice}
              className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-lg bg-bear px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              <ArrowDownRight size={17} aria-hidden />
              Sell
            </button>
            <div className="flex h-10 items-center rounded-lg border app-border p-1">
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
            <label className="flex h-10 items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3">
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
            <span className="text-xs app-muted">
              {stopLoss ? `SL ${stopLoss}` : "Use chart SL"}
              {takeProfit ? ` · TP ${takeProfit}` : ""}
            </span>
          </>
        )}
        <div className="rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Balance</span>
          <span className="font-mono text-sm font-semibold">${state.balance}</span>
        </div>
        <div className="rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Equity</span>
          <span className={`font-mono text-sm font-semibold ${equityTone}`}>${state.equity}</span>
        </div>
        <div className="rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Spread</span>
          <span className="font-mono text-sm font-semibold">{state.config.spreadPips} pips</span>
        </div>
      </div>
    </div>
  );
}
