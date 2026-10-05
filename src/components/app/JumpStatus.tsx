"use client";
import { useEffect, useState } from "react";

export function JumpStatus({ active, destination, phase, percent, onCancel }: {
  active: boolean; destination: string | null;
  phase?: "loading" | "processing" | "stopping"; percent?: number; onCancel: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) { setVisible(false); return; }
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, [active]);
  if (!active || !visible) return null;
  return <div className="flex min-w-0 items-center gap-2 text-xs" data-testid="go-to-progress">
    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent app-muted" aria-hidden />
    <span className="max-w-44 truncate app-muted" role="status" aria-live="polite">
      {phase === "stopping" ? "Stopping…" : `${phase === "loading" ? "Loading" : "Moving to"} ${destination ?? "destination"}${percent != null ? ` · ${percent}%` : ""}`}
    </span>
    <button type="button" onClick={onCancel} disabled={phase === "stopping"} className="rounded px-2 py-1 text-xs hover:bg-[var(--app-panel-2)] disabled:opacity-50">Cancel</button>
  </div>;
}
