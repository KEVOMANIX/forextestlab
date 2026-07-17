"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { OpenPosition } from "@/lib/backtest/types";

interface PositionEditorModalProps {
  position: OpenPosition | null;
  onDismiss: () => void;
  onSave: (positionId: string, stopLoss: string | null, takeProfit: string | null) => void;
  onClose: (positionId: string, lots?: string) => void;
}

export function PositionEditorModal({ position, onDismiss, onSave, onClose }: PositionEditorModalProps) {
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  useEffect(() => {
    setStopLoss(position?.stopLoss ?? "");
    setTakeProfit(position?.takeProfit ?? "");
  }, [position]);

  if (!position) return null;

  const closePercent = (percent: number) => {
    const lots = percent === 100
      ? undefined
      : (Number(position.lots) * percent / 100).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    onClose(position.id, lots);
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onDismiss()}>
      <section className="w-full max-w-sm rounded-xl border app-border bg-[var(--app-panel)] p-4 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="position-editor-title">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="position-editor-title" className="font-semibold">Manage position</h2>
            <p className={`mt-1 font-mono text-xs ${position.direction === "long" ? "text-brand-300" : "text-bear"}`}>
              {position.direction === "long" ? "BUY" : "SELL"} {position.lots} lot @ {position.entryPrice}
            </p>
          </div>
          <button type="button" onClick={onDismiss} className="grid h-8 w-8 place-items-center rounded-md app-muted hover:bg-white/[0.06]" aria-label="Close position editor"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs app-muted">Stop loss
            <input className="app-input mt-1 w-full font-mono" inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="No stop" />
          </label>
          <label className="text-xs app-muted">Take profit
            <input className="app-input mt-1 w-full font-mono" inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="No target" />
          </label>
        </div>
        <button
          type="button"
          className="btn-primary mt-3 w-full"
          onClick={() => {
            onSave(position.id, stopLoss.trim() || null, takeProfit.trim() || null);
            onDismiss();
          }}
        >
          Save protection
        </button>

        <div className="mt-4 border-t app-border pt-3">
          <p className="mb-2 text-xs font-semibold app-muted">Close position</p>
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((percent) => (
              <button key={percent} type="button" onClick={() => closePercent(percent)} className={`rounded-md border px-2 py-2 text-xs font-semibold ${percent === 100 ? "border-bear/40 bg-bear/10 text-bear hover:bg-bear/20" : "app-border hover:bg-white/[0.05]"}`}>
                {percent === 100 ? "Close all" : `${percent}%`}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
