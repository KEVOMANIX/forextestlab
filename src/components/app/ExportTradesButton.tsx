"use client";

import { Download } from "lucide-react";

/**
 * Downloads the session's simulated trades as CSV. The file is built by the
 * server, which checks the Pro entitlement; this is only the link to it.
 */
export function ExportTradesButton({
  tradeCount,
  sessionId,
  compact = false,
}: {
  tradeCount: number;
  sessionId: string;
  compact?: boolean;
}) {
  const className = compact
    ? "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted transition-colors hover:bg-white/[0.05] hover:text-[var(--app-text)]"
    : "btn-secondary py-2 text-xs";
  const label = <><Download size={14} aria-hidden /> {compact ? "Export" : "Export trades (CSV)"}</>;
  if (tradeCount === 0) {
    return <span aria-disabled="true" className={`${className} cursor-not-allowed opacity-40`}>{label}</span>;
  }
  return (
    <a href={`/api/backtest/sessions/${encodeURIComponent(sessionId)}/export`} download className={className}>
      {label}
    </a>
  );
}
