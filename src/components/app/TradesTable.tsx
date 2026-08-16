"use client";

import { useEffect, useRef, useState } from "react";

import { tradeExcursion } from "@/lib/backtest/exit-quality";
import type { ClosedTrade } from "@/lib/backtest/types";
import { formatNewYorkDateTime } from "@/lib/date-time";

const PAGE_SIZE = 10;

function fmtTime(ms: number): string {
  return formatNewYorkDateTime(ms, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const EXIT_LABEL: Record<ClosedTrade["exitReason"], string> = {
  "stop-loss": "Stop-loss",
  "take-profit": "Take-profit",
  manual: "Manual",
  "session-end": "Session end",
};

export function TradesTable({
  trades,
  focusedTrade,
}: {
  trades: ClosedTrade[];
  /**
   * 1-based ledger number to reveal, set when an AI answer cites a trade. The
   * table pages to it and highlights the row until another one is chosen.
   */
  focusedTrade?: number | null;
}) {
  const [page, setPage] = useState(0);
  const rowRef = useRef<HTMLTableRowElement>(null);

  const pageCount = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));

  useEffect(() => {
    if (!focusedTrade) return;
    setPage(Math.floor((focusedTrade - 1) / PAGE_SIZE));
  }, [focusedTrade]);

  useEffect(() => {
    if (!focusedTrade) return;
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedTrade, page]);

  if (trades.length === 0) {
    return <p className="p-4 text-sm app-muted">No trades yet. Place a simulated Buy or Sell to begin.</p>;
  }

  const clamped = Math.min(page, pageCount - 1);
  const offset = clamped * PAGE_SIZE;
  const rows = trades.slice(offset, offset + PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Simulated trade history</caption>
          <thead className="sticky top-0 z-10 bg-[var(--app-panel-solid)] app-muted">
            <tr className="border-b app-border">
              <th scope="col" className="px-3 py-2 font-medium">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Direction</th>
              <th scope="col" className="px-3 py-2 font-medium">Symbol</th>
              <th scope="col" className="px-3 py-2 font-medium">Entry</th>
              <th scope="col" className="px-3 py-2 font-medium">Exit</th>
              <th scope="col" className="px-3 py-2 font-medium">Size</th>
              <th scope="col" className="px-3 py-2 font-medium">SL / TP</th>
              <th scope="col" className="px-3 py-2 font-medium">Exit reason</th>
              <th scope="col" className="px-3 py-2 text-right font-medium" title="Best the trade was ever worth, in units of its initial risk">Peak</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Pips</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">P/L</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((t, rowIndex) => {
              const win = Number(t.pnl) >= 0;
              const number = offset + rowIndex + 1;
              const { peakR: peak, capturedR: captured } = tradeExcursion(t);
              const focused = number === focusedTrade;
              return (
                <tr
                  key={t.id}
                  ref={focused ? rowRef : undefined}
                  className={`border-b app-border/60 ${focused ? "bg-brand-400/[0.12] outline outline-1 outline-brand-400/40" : ""}`}
                >
                  <td className="px-3 py-2 app-muted">{number}</td>
                  <td className="px-3 py-2">
                    <span className={win ? "text-brand-300" : "text-bear"}>
                      {t.direction === "long" ? "▲ Long" : "▼ Short"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold">{t.symbol ?? "—"}</td>
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
                  <td className="px-3 py-2 text-right app-muted" title={peak === null ? "This trade defined no risk, so R has no meaning" : `Peak ${peak.toFixed(2)}R, kept ${(captured ?? 0).toFixed(2)}R`}>
                    {peak === null ? "—" : `${peak >= 0 ? "+" : "−"}${Math.abs(peak).toFixed(2)}R`}
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
