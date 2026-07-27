"use client";

import Link from "next/link";
import { BarChart3, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

import { computeStatistics } from "@/lib/backtest/statistics";
import type { PublicSessionState } from "@/lib/backtest/types";
import { AccountSummary } from "./AccountSummary";
import { SessionClock } from "./SessionClock";
import { TimeZoneClock } from "./TimeZoneClock";
import { StatsGrid } from "./StatsGrid";
import { TradesTable } from "./TradesTable";

type Tab = "position" | "trades" | "orders" | "statistics" | "notes";

const TABS: { id: Exclude<Tab, "statistics">; label: string }[] = [
  { id: "position", label: "Open Positions" },
  { id: "orders", label: "Orders" },
  { id: "trades", label: "Trades" },
  { id: "notes", label: "Journal" },
];

interface BottomPanelProps {
  state: PublicSessionState;
  currentTime?: number | null;
  /** Zone the charts are displayed in, so every clock in the app agrees. */
  timeZone: string;
  onTimeZoneChange: (zone: string) => void;
  theme: "dark" | "light";
  initialNotes?: string;
  onSaveNotes: (notes: string) => void;
  busy: boolean;
}

export function BottomPanel({
  state,
  currentTime = null,
  timeZone,
  onTimeZoneChange,
  theme,
  initialNotes = "",
  onSaveNotes,
  busy,
}: BottomPanelProps) {
  const [tab, setTab] = useState<Tab>("position");
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(initialNotes);

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

  const openCount = state.openPositions.length;

  const selectTab = (next: Tab) => {
    if (expanded && tab === next) {
      setExpanded(false);
      return;
    }
    setTab(next);
    setExpanded(true);
  };

  return (
    <section
      className={`relative flex shrink-0 flex-col overflow-hidden border-t app-border bg-[var(--app-panel)] transition-[height] duration-200 ease-out ${
        expanded ? "h-44 md:h-48" : "h-11"
      }`}
      aria-label="Session details"
    >
      {expanded && (
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={tab === "statistics" ? "analytics-button" : `tab-${tab}`}
          className="min-h-0 flex-1 overflow-auto border-b app-border"
        >
          {tab === "position" &&
            (state.openPositions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="app-muted"><tr className="border-b app-border"><th className="px-3 py-2">Side</th><th>Lots</th><th>Entry</th><th>SL</th><th>TP</th><th>Commission</th><th>Unrealised</th></tr></thead>
                  <tbody>
                    {state.openPositions.map((position) => (
                      <tr key={position.id} className="border-b app-border font-mono">
                        <td className={`px-3 py-2 font-semibold ${position.direction === "long" ? "text-brand-300" : "text-bear"}`}>{position.direction === "long" ? "BUY" : "SELL"}</td>
                        <td>{position.lots}</td><td>{position.entryPrice}</td><td>{position.stopLoss ?? "—"}</td><td>{position.takeProfit ?? "—"}</td><td>{position.commission}</td>
                        <td className={Number(position.unrealizedPnl) >= 0 ? "text-brand-300" : "text-bear"}>{position.unrealizedPnl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-sm app-muted">No open positions.</p>
            ))}

          {tab === "trades" && <TradesTable trades={state.closedTrades} />}

          {tab === "orders" && (
            <p className="p-4 text-sm app-muted">
              {state.closedTrades.length + openCount === 0
                ? "No orders."
                : `${state.closedTrades.length} closed · ${openCount} open`}
            </p>
          )}

          {tab === "statistics" && (
            <div className="p-4">
              <StatsGrid stats={stats} />
            </div>
          )}

          {tab === "notes" && state.anonymous ? (
            <div className="p-4 text-sm app-muted">
              Create an account to save private session notes.
            </div>
          ) : tab === "notes" ? (
            <div className="space-y-2 p-4">
              <label htmlFor="session-notes" className="text-xs app-muted">Session notes</label>
              <textarea
                id="session-notes"
                rows={3}
                className="app-input w-full resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Record your observations…"
              />
              <button type="button" className="btn-secondary" onClick={() => onSaveNotes(notes)} disabled={busy}>
                Save notes
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Centred on the bar, not on the space left between the two groups —
          the guest notice moved left so nothing sits under it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden h-9 items-center justify-center md:flex">
        <div className="pointer-events-auto">
          <TimeZoneClock zone={timeZone} theme={theme} onChange={onTimeZoneChange} />
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center overflow-x-auto px-1.5 text-[11px]">
        <div role="tablist" aria-label="Session panels" className="flex h-full shrink-0 items-center">
          {TABS.map((item) => {
            const count = item.id === "position" ? openCount : item.id === "trades" ? state.closedTrades.length : null;
            const active = expanded && tab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={active}
                aria-expanded={active}
                id={`tab-${item.id}`}
                aria-controls={`panel-${item.id}`}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`inline-flex h-full shrink-0 items-center gap-1.5 border-r app-border px-2.5 font-semibold transition-colors ${
                  active ? "bg-white/[0.04] text-blue-400" : "app-muted hover:text-[var(--app-text)]"
                }`}
              >
                {item.label}
                {count !== null && <span className="rounded bg-white/[0.08] px-1 font-mono">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Left of centre, so it never sits under the centred clock. */}
        {state.anonymous && (
          <span className="hidden shrink-0 border-r app-border px-3 text-[10px] text-brand-300 xl:inline-flex">
            Guest session&nbsp;·&nbsp;
            <Link href="/sign-up" className="font-semibold underline">Create a free account</Link>
          </span>
        )}

        <div className="ml-auto flex h-full shrink-0 items-center">
          <div className="hidden h-full border-l app-border sm:flex">
            <AccountSummary
              state={state}
              clock={
                <SessionClock
                  candleTime={currentTime}
                  timeframe={state.config.timeframe}
                  speed={state.speed}
                  running={state.status === "running"}
                  zone={timeZone}
                />
              }
            />
          </div>
          <button
            id="analytics-button"
            type="button"
            onClick={() => selectTab("statistics")}
            className="ml-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 font-semibold text-white transition-colors hover:bg-blue-500"
            aria-expanded={expanded && tab === "statistics"}
            aria-controls="panel-statistics"
          >
            <BarChart3 size={13} aria-hidden />
            Analytics
          </button>
          <ChevronUp
            size={13}
            aria-hidden
            className={`ml-1 app-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>
    </section>
  );
}
