"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, X } from "lucide-react";

import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { livePositionMetrics } from "@/lib/backtest/position-management";
import type { OpenPosition, PublicSessionState } from "@/lib/backtest/types";

interface PositionEditorModalProps {
  state: PublicSessionState;
  position: OpenPosition | null;
  onDismiss: () => void;
  onSave: (
    positionId: string,
    stopLoss: string | null,
    takeProfit: string | null,
  ) => void;
  onBreakEven: (positionId: string) => void;
  onTrailingStop: (positionId: string, pips: string | null) => void;
  onClose: (positionId: string, lots?: string) => void | Promise<unknown>;
}

function signed(value: string, suffix = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}${suffix}`;
}

function trimLots(value: number) {
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export function PositionEditorModal({
  state,
  position,
  onDismiss,
  onSave,
  onBreakEven,
  onTrailingStop,
  onClose,
}: PositionEditorModalProps) {
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [trailingEnabled, setTrailingEnabled] = useState(false);
  const [trailingPips, setTrailingPips] = useState("20");
  const [customLots, setCustomLots] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    setStopLoss(position?.stopLoss ?? "");
    setTakeProfit(position?.takeProfit ?? "");
    setTrailingEnabled(Boolean(position?.trailingStopPips));
    setTrailingPips(position?.trailingStopPips ?? "20");
    setCustomLots("");
    setCloseError(null);
  }, [position?.id, position?.stopLoss, position?.takeProfit, position?.trailingStopPips]);

  const metrics = useMemo(
    () => (position ? livePositionMetrics(state, position) : null),
    [position, state],
  );
  const dialogRef = useModalBehavior<HTMLElement>({
    open: Boolean(position),
    onClose: onDismiss,
  });

  if (!position || !metrics) return null;

  const closeLots = async (lots?: string) => {
    try {
      await onClose(position.id, lots);
    } finally {
      onDismiss();
    }
  };
  const closePercent = (percent: number) => {
    void closeLots(
      percent === 100
        ? undefined
        : trimLots((Number(position.lots) * percent) / 100),
    );
  };
  const closeCustom = () => {
    const requested = Number(customLots);
    const available = Number(position.lots);
    if (
      !Number.isFinite(requested) ||
      requested <= 0 ||
      requested > available
    ) {
      setCloseError(`Enter an amount from 0 to ${position.lots} lots.`);
      return;
    }
    void closeLots(trimLots(requested));
  };
  const applyTrailing = () => {
    const distance = Number(trailingPips);
    if (trailingEnabled && (!Number.isFinite(distance) || distance <= 0)) return;
    onTrailingStop(position.id, trailingEnabled ? trailingPips : null);
  };

  const positive = Number(metrics.pnl) >= 0;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && onDismiss()
      }
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-xl border app-border bg-[var(--app-panel)] p-4 shadow-2xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-editor-title"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${
                  position.direction === "long"
                    ? "bg-brand-400/15 text-brand-300"
                    : "bg-bear/15 text-bear"
                }`}
              >
                ACTIVE
              </span>
              <h2 id="position-editor-title" className="font-semibold">
                Manage position
              </h2>
            </div>
            <p
              className={`mt-1 font-mono text-xs ${
                position.direction === "long" ? "text-brand-300" : "text-bear"
              }`}
            >
              {position.direction === "long" ? "BUY" : "SELL"} {position.lots} lot
              {" @ "}
              {position.entryPrice}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="grid h-8 w-8 place-items-center rounded-md app-muted hover:bg-white/[0.06]"
            aria-label="Close position editor"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg border app-border bg-black/10 px-3 py-3" aria-label="Live position performance">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide app-muted">Unrealized P&amp;L</p>
            <p className={`mt-1 font-mono text-lg font-bold ${positive ? "text-brand-300" : "text-bear"}`}>
              {signed(metrics.pnl)} {state.config.accountCurrency}
            </p>
          </div>
          <p className="text-right font-mono text-xs app-muted">
            {signed(metrics.pips)} pips
            {metrics.rMultiple ? <><br />{signed(metrics.rMultiple)}R</> : null}
          </p>
        </div>

        <button type="button" onClick={() => closePercent(100)} className="mt-3 w-full rounded-lg bg-bear px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-bear/90">
          Close full position
        </button>

        <details className="group mt-3 rounded-lg border app-border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">
            <span>Protection &amp; trailing stop</span>
            <span className="flex items-center gap-2 app-muted">
              <span className="hidden font-mono sm:inline">SL {position.stopLoss ?? "—"} · TP {position.takeProfit ?? "—"}</span>
              <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <div className="border-t app-border p-3">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold">Protection</p>
            <button
              type="button"
              disabled={!metrics.canBreakEven}
              title={
                metrics.canBreakEven
                  ? "Move stop loss to entry price"
                  : "Break-even becomes available after price moves beyond entry"
              }
              onClick={() => {
                onBreakEven(position.id);
                setStopLoss(position.entryPrice);
              }}
              className="rounded-md border app-border px-2 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Move to break-even
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs app-muted">
              Stop loss
              <input
                className="app-input mt-1 w-full font-mono"
                inputMode="decimal"
                value={stopLoss}
                onChange={(event) => setStopLoss(event.target.value)}
                placeholder="No stop"
              />
            </label>
            <label className="text-xs app-muted">
              Take profit
              <input
                className="app-input mt-1 w-full font-mono"
                inputMode="decimal"
                value={takeProfit}
                onChange={(event) => setTakeProfit(event.target.value)}
                placeholder="No target"
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-primary mt-3 w-full"
            onClick={() => {
              onSave(
                position.id,
                stopLoss.trim() || null,
                takeProfit.trim() || null,
              );
            }}
          >
            Save protection
          </button>
        </div>

        <div className="mt-3 rounded-lg border app-border p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <Activity size={14} aria-hidden />
              Trailing stop
            </span>
            <button
              type="button"
              role="switch"
              aria-label="Trailing stop"
              aria-checked={trailingEnabled}
              onClick={() => setTrailingEnabled((enabled) => !enabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                trailingEnabled ? "bg-brand-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  trailingEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed app-muted">
            Tightens at each candle close and never moves away from price.
          </p>
          <div className="mt-2 flex gap-2">
            <label className="min-w-0 flex-1 text-[11px] app-muted">
              Distance in pips
              <input
                className="app-input mt-1 w-full font-mono text-xs"
                inputMode="decimal"
                disabled={!trailingEnabled}
                value={trailingPips}
                onChange={(event) => setTrailingPips(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={applyTrailing}
              className="mt-4 rounded-md border app-border px-3 text-xs font-semibold hover:bg-white/[0.05]"
            >
              {trailingEnabled ? "Apply" : "Disable"}
            </button>
          </div>
        </div>
          </div>
        </details>

        <details className="group mt-3 rounded-lg border app-border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">
            <span>Partial close</span>
            <span className="flex items-center gap-2 app-muted">
              25%, 50%, 75% or custom
              <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <div className="border-t app-border p-3">
          <div className="grid grid-cols-3 gap-2">
            {[25, 50, 75].map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => closePercent(percent)}
                className="rounded-md border app-border px-2 py-2 text-xs font-semibold hover:bg-white/[0.05]"
              >
                {percent}%
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <label className="min-w-0 flex-1 text-[11px] app-muted">
              Custom lot amount
              <input
                className="app-input mt-1 w-full font-mono text-xs"
                inputMode="decimal"
                value={customLots}
                onChange={(event) => {
                  setCustomLots(event.target.value);
                  setCloseError(null);
                }}
                placeholder={`Max ${position.lots}`}
                aria-label="Custom lot amount"
              />
            </label>
            <button
              type="button"
              onClick={closeCustom}
              className="mt-4 rounded-md border border-bear/40 px-3 text-xs font-semibold text-bear hover:bg-bear/10"
            >
              Close lots
            </button>
          </div>
          {closeError && (
            <p className="mt-1 text-[11px] text-bear" role="alert">
              {closeError}
            </p>
          )}
          </div>
        </details>
      </section>
    </div>
  );
}
