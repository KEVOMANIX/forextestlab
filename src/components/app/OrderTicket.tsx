"use client";

import { useMemo, useState } from "react";

import { calculatePositionSize } from "@/lib/backtest/position-sizing";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import type { OrderRequest, PublicSessionState, TradeDirection } from "@/lib/backtest/types";

interface OrderTicketProps {
  state: PublicSessionState;
  busy: boolean;
  onPlaceOrder: (order: OrderRequest) => void;
  onClose: () => void;
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel-2 p-3">
      <p className="text-xs app-muted">{label}</p>
      <p className={`mt-1 font-mono text-base font-semibold ${tone}`}>{value}</p>
    </div>
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

  const equityTone = Number(state.equity) >= Number(state.config.startingBalance)
    ? "text-brand-300"
    : "text-bear";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Current price" value={price ?? "—"} />
        <Stat label="Simulation spread" value={`${state.config.spreadPips} pips`} />
        <Stat label="Balance" value={`$${state.balance}`} />
        <Stat label="Equity" value={`$${state.equity}`} tone={equityTone} />
      </div>

      {hasPosition && state.openPosition ? (
        <div className="panel-2 p-4">
          <div className="flex items-center justify-between">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                state.openPosition.direction === "long"
                  ? "bg-brand-400/15 text-brand-300"
                  : "bg-bear/15 text-bear"
              }`}
            >
              {state.openPosition.direction === "long" ? "LONG" : "SHORT"} {state.openPosition.lots} lots
            </span>
            <span className={`font-mono text-sm ${Number(state.openPosition.unrealizedPnl) >= 0 ? "text-brand-300" : "text-bear"}`}>
              {state.openPosition.unrealizedPnl}
            </span>
          </div>
          <dl className="mt-3 space-y-1 font-mono text-xs app-muted">
            <div className="flex justify-between"><dt>Entry</dt><dd>{state.openPosition.entryPrice}</dd></div>
            <div className="flex justify-between"><dt>Stop-loss</dt><dd>{state.openPosition.stopLoss ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Take-profit</dt><dd>{state.openPosition.takeProfit ?? "—"}</dd></div>
          </dl>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-secondary mt-4 w-full"
          >
            Close position
          </button>
        </div>
      ) : (
        <div className="panel-2 space-y-3 p-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium app-muted">Position sizing</span>
            <div className="grid grid-cols-2 gap-1 rounded-lg border app-border p-1">
              {(["risk-percent", "fixed-lots"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSizingMode(mode)}
                  aria-pressed={sizingMode === mode}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    sizingMode === mode ? "bg-brand-400/15 text-brand-300" : "app-muted"
                  }`}
                >
                  {mode === "risk-percent" ? "Risk %" : "Fixed lots"}
                </button>
              ))}
            </div>
          </div>

          {sizingMode === "risk-percent" ? (
            <label className="block">
              <span className="mb-1 block text-xs app-muted">Account risk (%)</span>
              <input
                className="app-input w-full"
                inputMode="decimal"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                aria-label="Account risk percent"
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs app-muted">Lot size</span>
              <input
                className="app-input w-full"
                inputMode="decimal"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                aria-label="Lot size"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs app-muted">Stop-loss</span>
              <input
                className="app-input w-full"
                inputMode="decimal"
                placeholder="price"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                aria-label="Stop-loss price"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs app-muted">Take-profit</span>
              <input
                className="app-input w-full"
                inputMode="decimal"
                placeholder="price"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                aria-label="Take-profit price"
              />
            </label>
          </div>

          {preview && (
            <dl className="space-y-1 font-mono text-xs app-muted">
              <div className="flex justify-between"><dt>Est. size</dt><dd>{preview.lots} lots</dd></div>
              <div className="flex justify-between"><dt>Risk amount</dt><dd>${preview.riskAmount}</dd></div>
              <div className="flex justify-between"><dt>Stop distance</dt><dd>{preview.stopDistancePips} pips</dd></div>
              <div className="flex justify-between"><dt>Max loss</dt><dd>${preview.maxExpectedLoss}</dd></div>
              {preview.crossCurrencyApprox && (
                <p className="pt-1 text-amber-400">Cross-currency pip value approximated.</p>
              )}
            </dl>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => submit("long")}
              disabled={busy || finished || !price}
              className="rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => submit("short")}
              disabled={busy || finished || !price}
              className="rounded-lg bg-bear py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40"
            >
              Sell
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
