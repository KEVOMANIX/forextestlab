"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown } from "lucide-react";

import type { OrderRequest, PublicSessionState, TradeDirection } from "@/lib/backtest/types";

interface OrderTicketProps {
  state: PublicSessionState;
  busy: boolean;
  stopLoss: string | null;
  takeProfit: string | null;
  onPlaceOrder: (order: OrderRequest) => void;
  onTemplateChange: (template: Omit<OrderRequest, "direction">) => void;
  referencePair?: string | null;
}

export function OrderTicket({
  state,
  stopLoss,
  takeProfit,
  onPlaceOrder,
  onTemplateChange,
  referencePair = null,
}: OrderTicketProps) {
  const [sizingMode, setSizingMode] = useState<"risk-percent" | "fixed-lots">("fixed-lots");
  const [riskPercent, setRiskPercent] = useState("1");
  const [lots, setLots] = useState("0.10");
  const [mobileDetails, setMobileDetails] = useState(false);
  const unavailable = state.status === "finished" || !state.currentPrice || Boolean(referencePair);

  // Live bid/ask for the active pair, derived from the mid price + configured spread.
  const pair = state.config.symbol;
  const precision = state.config.pricePrecision ?? 5;
  const pip = Number(state.config.pipSize) || 0;
  const spread = Number(state.config.spreadPips) || 0;
  const mid = state.currentPrice != null ? Number(state.currentPrice) : null;
  const ask = mid != null ? mid + (spread * pip) / 2 : null;
  const bid = mid != null ? mid - (spread * pip) / 2 : null;

  useEffect(() => {
    onTemplateChange({
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
    });
  }, [lots, onTemplateChange, riskPercent, sizingMode]);

  function submit(direction: TradeDirection) {
    if (unavailable) return;
    onPlaceOrder({
      direction,
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
      stopLoss: stopLoss ?? undefined,
      takeProfit: takeProfit ?? undefined,
    });
  }

  return (
    <div className="min-w-0 flex-1 overflow-x-auto">
      <div className="flex min-w-max items-center gap-1.5">
        {referencePair && (
          <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-300">
            {referencePair} · view only
          </div>
        )}
        <span className="hidden px-1 text-xs font-semibold app-muted sm:inline" title="Active pair">
          {pair}
        </span>
        <button
          type="button"
          onClick={() => submit("short")}
          aria-disabled={unavailable}
          className="inline-flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-md bg-bear px-3 font-bold text-white transition hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <ArrowDownRight size={16} aria-hidden />
          <span className="flex flex-col items-center leading-none">
            <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">Sell</span>
            {bid != null && <span className="mt-0.5 font-mono text-xs">{bid.toFixed(precision)}</span>}
          </span>
        </button>
        <button
          type="button"
          onClick={() => submit("long")}
          aria-disabled={unavailable}
          className="inline-flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-md bg-brand-500 px-3 font-bold text-surface-950 transition hover:bg-brand-400 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <ArrowUpRight size={16} aria-hidden />
          <span className="flex flex-col items-center leading-none">
            <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">Buy</span>
            {ask != null && <span className="mt-0.5 font-mono text-xs">{ask.toFixed(precision)}</span>}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileDetails((open) => !open)}
          className="inline-flex h-8 items-center gap-1 rounded-md border app-border px-2 text-xs font-semibold sm:hidden"
          aria-expanded={mobileDetails}
        >
          Size <ChevronDown size={13} aria-hidden />
        </button>
        <div className={`${mobileDetails ? "flex" : "hidden"} h-8 items-center rounded-md border app-border p-0.5 sm:flex`}>
          {(["fixed-lots", "risk-percent"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSizingMode(mode)}
              aria-pressed={sizingMode === mode}
              className={`h-7 rounded px-2 text-[11px] font-semibold ${
                sizingMode === mode ? "bg-brand-400/15 text-brand-300" : "app-muted"
              }`}
            >
              {mode === "fixed-lots" ? "Lots" : "Risk %"}
            </button>
          ))}
        </div>
        <label className={`${mobileDetails ? "flex" : "hidden"} h-8 items-center gap-1.5 rounded-md border app-border bg-[var(--app-panel-2)] px-2 sm:flex`}>
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
      </div>
    </div>
  );
}
