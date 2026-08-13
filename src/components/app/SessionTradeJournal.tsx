"use client";

import { useCallback, useState } from "react";

import type { ClosedTrade, PublicSessionState, TradeJournalUpdate } from "@/lib/backtest/types";
import { TradeJournalEditor } from "./TradeJournalEditor";

export function SessionTradeJournal({
  sessionId,
  initialTrades,
  collapsible = false,
}: {
  sessionId: string;
  initialTrades: ClosedTrade[];
  collapsible?: boolean;
}) {
  const [trades, setTrades] = useState(initialTrades);
  const save = useCallback(async (journalId: string, journal: TradeJournalUpdate) => {
    const response = await fetch(`/api/backtest/sessions/${sessionId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "update-journal", journalId, journal }),
    });
    const data = (await response.json()) as { ok: boolean; error?: string; state?: PublicSessionState };
    if (!response.ok || !data.ok || !data.state) throw new Error(data.error ?? "Journal could not be saved.");
    setTrades(data.state.closedTrades);
  }, [sessionId]);

  if (collapsible) {
    return (
      <details className="panel group mt-5 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4">
          <span><span className="block font-semibold">Trade journal</span><span className="mt-1 block text-xs font-normal app-muted">Review decisions and edit notes for {trades.length} closed trade{trades.length === 1 ? "" : "s"}.</span></span>
          <span className="rounded-lg border app-border px-3 py-1.5 text-xs font-semibold app-muted transition-colors group-open:text-brand-300">Open journal</span>
        </summary>
        <div className="border-t app-border"><TradeJournalEditor closedTrades={trades} onSave={save} /></div>
      </details>
    );
  }

  return (
    <section className="panel mt-6 overflow-hidden">
      <div className="border-b app-border p-5">
        <h2 className="font-semibold">Trade journal</h2>
        <p className="mt-1 text-xs app-muted">Review every decision. Changes autosave and remain available inside the backtester.</p>
      </div>
      <TradeJournalEditor closedTrades={trades} onSave={save} />
    </section>
  );
}
