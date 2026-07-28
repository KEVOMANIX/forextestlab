"use client";

import { useCallback, useState } from "react";

import type { ClosedTrade, PublicSessionState, TradeJournalUpdate } from "@/lib/backtest/types";
import { TradeJournalEditor } from "./TradeJournalEditor";

export function SessionTradeJournal({
  sessionId,
  initialTrades,
}: {
  sessionId: string;
  initialTrades: ClosedTrade[];
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
