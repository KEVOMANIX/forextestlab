"use client";

import { Download } from "lucide-react";

import type { ClosedTrade } from "@/lib/backtest/types";

/**
 * Exports the user's SIMULATED TRADE results as CSV. It deliberately does NOT
 * export the underlying market-data dataset — only the trades the user made.
 */
export function ExportTradesButton({
  trades,
  symbol,
  sessionId,
  compact = false,
}: {
  trades: ClosedTrade[];
  symbol: string;
  sessionId: string;
  compact?: boolean;
}) {
  function download() {
    const header = [
      // First column, because a multi-pair export without it is unusable: the
      // rows arrive interleaved with nothing to group them by.
      "symbol",
      "direction",
      "entryTime",
      "entryPrice",
      "exitTime",
      "exitPrice",
      "lots",
      "stopLoss",
      "takeProfit",
      "initialRiskAmount",
      "maxAdversePnl",
      "maxFavorablePnl",
      "commission",
      "pips",
      "pnl",
      "exitReason",
      "intrabarAmbiguous",
    ];
    const rows = trades.map((t) =>
      [
        // Trades saved before multi-pair execution carry no symbol of their
        // own; those were all taken on the session's traded pair.
        t.symbol ?? symbol,
        t.direction,
        new Date(t.entryTime).toISOString(),
        t.entryPrice,
        new Date(t.exitTime).toISOString(),
        t.exitPrice,
        t.lots,
        t.stopLoss ?? "",
        t.takeProfit ?? "",
        t.initialRiskAmount ?? "",
        t.maxAdversePnl ?? "",
        t.maxFavorablePnl ?? "",
        t.commission,
        t.pips,
        t.pnl,
        t.exitReason,
        String(t.intrabarAmbiguous),
      ].join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Named for the session, not for one of its pairs: a file called
    // "EURUSD" holding GBP/USD and XAU/USD trades misfiles itself.
    const pairs = new Set(trades.map((t) => t.symbol ?? symbol));
    const label = pairs.size === 1 ? [...pairs][0] : `${pairs.size}-pairs`;
    a.download = `forextestlab-${label}-${sessionId.slice(0, 8)}-trades.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={trades.length === 0}
      className={compact ? "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold app-muted transition-colors hover:bg-white/[0.05] hover:text-[var(--app-text)] disabled:opacity-40" : "btn-secondary py-2 text-xs disabled:opacity-40"}
    >
      <Download size={14} aria-hidden /> {compact ? "Export" : "Export trades (CSV)"}
    </button>
  );
}
