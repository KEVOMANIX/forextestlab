"use client";

import { useEffect, useState } from "react";

export function LoadingProgress({ value, label, smooth = true }: { value: number; label: string; smooth?: boolean }) {
  const target = Math.max(0, Math.min(100, value));
  const [displayed, setDisplayed] = useState(target);
  useEffect(() => {
    if (!smooth || target === 100) {
      setDisplayed(target);
      return;
    }
    setDisplayed((current) => Math.max(current, target));
    // Requests do not report byte totals. Estimate movement between real
    // checkpoints, leaving room for the next stage and never completing early.
    const ceiling = 97;
    const timer = window.setInterval(() => {
      setDisplayed((current) => current >= ceiling ? current : Math.min(ceiling, current + Math.max(0.1, (ceiling - current) * 0.015)));
    }, 450);
    return () => window.clearInterval(timer);
  }, [target, smooth]);
  const percent = Math.round(smooth ? displayed : target);
  return (
    <div className="w-full">
      <div className="mb-2.5 flex items-center justify-between gap-4 text-xs">
        <span className="text-[var(--app-muted,#94a3b8)]">{label}</span>
        <span className="flex items-center gap-2"><span className="text-[10px] text-[var(--app-muted,#94a3b8)]">{smooth && percent < 100 ? "Estimated" : ""}</span><span className="font-mono font-semibold tabular-nums text-brand-400">{percent}%</span></span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-brand-400/10">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
