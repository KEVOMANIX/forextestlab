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
        <button
          type="button"
          onClick={() => submit("long")}
          aria-disabled={unavailable}
          className="inline-flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-md bg-brand-500 px-3 text-xs font-bold text-surface-950 transition hover:bg-brand-400 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <ArrowUpRight size={17} aria-hidden />
          Buy
        </button>
        <button
          type="button"
          onClick={() => submit("short")}
          aria-disabled={unavailable}
          className="inline-flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-md bg-bear px-3 text-xs font-bold text-white transition hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <ArrowDownRight size={17} aria-hidden />
          Sell
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
