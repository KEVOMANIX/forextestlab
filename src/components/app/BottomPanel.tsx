"use client";

import { useMemo, useState } from "react";

import { computeStatistics } from "@/lib/backtest/statistics";
import type { PublicSessionState } from "@/lib/backtest/types";
import { StatsGrid } from "./StatsGrid";
import { TradesTable } from "./TradesTable";

type Tab = "position" | "trades" | "orders" | "statistics" | "notes";

const TABS: { id: Tab; label: string }[] = [
  { id: "position", label: "Open position" },
  { id: "trades", label: "Trades" },
  { id: "orders", label: "Orders" },
  { id: "statistics", label: "Statistics" },
  { id: "notes", label: "Notes" },
];

interface BottomPanelProps {
  state: PublicSessionState;
  onSaveNotes: (notes: string) => void;
  busy: boolean;
}

export function BottomPanel({ state, onSaveNotes, busy }: BottomPanelProps) {
  const [tab, setTab] = useState<Tab>("trades");
  const [notes, setNotes] = useState("");

  const stats = useMemo(
    () =>
      computeStatistics({
        startingBalance: state.config.startingBalance,
        endingBalance: state.balance,
        trades: state.closedTrades,
        equityCurve: state.equityCurve,
      }),
    [state],
  );

  return (
    <section className="panel overflow-hidden" aria-label="Session details">
      <div role="tablist" aria-label="Session panels" className="flex flex-wrap gap-1 border-b app-border p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            id={`tab-${t.id}`}
            aria-controls={`panel-${t.id}`}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-brand-400/15 text-brand-300" : "app-muted hover:text-brand-300"
            }`}
          >
            {t.label}
            {t.id === "trades" && state.closedTrades.length > 0 && (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 text-xs">
                {state.closedTrades.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-[180px]">
        {tab === "position" &&
          (state.openPosition ? (
            <dl className="grid grid-cols-2 gap-3 p-4 font-mono text-sm sm:grid-cols-4">
              <div><dt className="text-xs app-muted">Direction</dt><dd>{state.openPosition.direction}</dd></div>
              <div><dt className="text-xs app-muted">Lots</dt><dd>{state.openPosition.lots}</dd></div>
              <div><dt className="text-xs app-muted">Entry</dt><dd>{state.openPosition.entryPrice}</dd></div>
              <div><dt className="text-xs app-muted">Unrealised</dt><dd className={Number(state.openPosition.unrealizedPnl) >= 0 ? "text-brand-300" : "text-bear"}>{state.openPosition.unrealizedPnl}</dd></div>
              <div><dt className="text-xs app-muted">Stop-loss</dt><dd>{state.openPosition.stopLoss ?? "—"}</dd></div>
              <div><dt className="text-xs app-muted">Take-profit</dt><dd>{state.openPosition.takeProfit ?? "—"}</dd></div>
              <div><dt className="text-xs app-muted">Commission</dt><dd>{state.openPosition.commission}</dd></div>
            </dl>
          ) : (
            <p className="p-4 text-sm app-muted">No open position.</p>
          ))}

        {tab === "trades" && <TradesTable trades={state.closedTrades} />}

        {tab === "orders" &&
          (state.closedTrades.length + (state.openPosition ? 1 : 0) === 0 ? (
            <p className="p-4 text-sm app-muted">No orders placed yet.</p>
          ) : (
            <p className="p-4 text-sm app-muted">
              {state.closedTrades.length} closed, {state.openPosition ? 1 : 0} open. See the Trades tab for details.
            </p>
          ))}

        {tab === "statistics" && (
          <div className="p-4">
            <StatsGrid stats={stats} />
          </div>
        )}

        {tab === "notes" && (
          <div className="space-y-2 p-4">
            <label htmlFor="session-notes" className="text-xs app-muted">
              Session notes (saved with your simulated session)
            </label>
            <textarea
              id="session-notes"
              rows={4}
              className="app-input w-full resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record your reasoning, mistakes, and observations…"
            />
            <button type="button" className="btn-secondary" onClick={() => onSaveNotes(notes)} disabled={busy}>
              Save notes
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
