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
}: {
  trades: ClosedTrade[];
  symbol: string;
  sessionId: string;
}) {
  function download() {
    const header = [
      "direction",
      "entryTime",
      "entryPrice",
      "exitTime",
      "exitPrice",
      "lots",
      "stopLoss",
      "takeProfit",
      "commission",
      "pips",
      "pnl",
      "exitReason",
      "intrabarAmbiguous",
    ];
    const rows = trades.map((t) =>
      [
        t.direction,
        new Date(t.entryTime).toISOString(),
        t.entryPrice,
        new Date(t.exitTime).toISOString(),
        t.exitPrice,
        t.lots,
        t.stopLoss ?? "",
        t.takeProfit ?? "",
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
    a.download = `forextestlab-${symbol}-${sessionId.slice(0, 8)}-trades.csv`;
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
      className="btn-secondary py-2 text-xs disabled:opacity-40"
    >
      <Download size={14} aria-hidden /> Export trades (CSV)
    </button>
  );
}
