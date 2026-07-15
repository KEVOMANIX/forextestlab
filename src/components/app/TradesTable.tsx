"use client";

import { useState } from "react";

import type { ClosedTrade } from "@/lib/backtest/types";

const PAGE_SIZE = 10;

function fmtTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

const EXIT_LABEL: Record<ClosedTrade["exitReason"], string> = {
  "stop-loss": "Stop-loss",
  "take-profit": "Take-profit",
  manual: "Manual",
  "session-end": "Session end",
};

export function TradesTable({ trades }: { trades: ClosedTrade[] }) {
  const [page, setPage] = useState(0);

  if (trades.length === 0) {
    return <p className="p-4 text-sm app-muted">No trades yet. Place a simulated Buy or Sell to begin.</p>;
  }

  const pageCount = Math.ceil(trades.length / PAGE_SIZE);
  const clamped = Math.min(page, pageCount - 1);
  const rows = trades.slice(clamped * PAGE_SIZE, clamped * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Simulated trade history</caption>
          <thead className="app-muted">
            <tr className="border-b app-border">
              <th scope="col" className="px-3 py-2 font-medium">Direction</th>
              <th scope="col" className="px-3 py-2 font-medium">Entry</th>
              <th scope="col" className="px-3 py-2 font-medium">Exit</th>
              <th scope="col" className="px-3 py-2 font-medium">Size</th>
              <th scope="col" className="px-3 py-2 font-medium">SL / TP</th>
              <th scope="col" className="px-3 py-2 font-medium">Exit reason</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Pips</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">P/L</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((t) => {
              const win = Number(t.pnl) >= 0;
              return (
                <tr key={t.id} className="border-b app-border/60">
                  <td className="px-3 py-2">
                    <span className={win ? "text-brand-300" : "text-bear"}>
                      {t.direction === "long" ? "▲ Long" : "▼ Short"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {t.entryPrice}
                    <span className="block app-muted">{fmtTime(t.entryTime)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {t.exitPrice}
                    <span className="block app-muted">{fmtTime(t.exitTime)}</span>
                  </td>
                  <td className="px-3 py-2">{t.lots}</td>
                  <td className="px-3 py-2">
                    {t.stopLoss ?? "—"} / {t.takeProfit ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {EXIT_LABEL[t.exitReason]}
                    {t.intrabarAmbiguous && (
                      <span
                        className="ml-1 cursor-help text-amber-400"
                        title="Stop-loss and take-profit were both within this candle; the configured execution policy decided the outcome. Not tick-accurate."
                        aria-label="Ambiguous intrabar sequencing"
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{t.pips}</td>
                  <td className={`px-3 py-2 text-right ${win ? "text-brand-300" : "text-bear"}`}>
                    {t.pnl}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between p-3 text-xs app-muted">
          <span>
            Page {clamped + 1} of {pageCount} · {trades.length} trades
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border app-border px-2 py-1 disabled:opacity-40"
              onClick={() => setPage(clamped - 1)}
              disabled={clamped === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded border app-border px-2 py-1 disabled:opacity-40"
              onClick={() => setPage(clamped + 1)}
              disabled={clamped >= pageCount - 1}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
