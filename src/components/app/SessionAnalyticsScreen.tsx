"use client";

/**
 * The session's analytics, full screen, over the terminal.
 *
 * The dock's Analytics tab used to show a four-by-two grid of headline numbers
 * in a 176px-tall drawer — the numbers a trader glances at, with none of the
 * equity curve, R-multiple, timing or per-trade analysis that answers *why*
 * they look like that. The full workbench already existed at
 * `/app/results/[sessionId]`, but reaching it meant leaving the session.
 *
 * So the button opens the workbench here instead, over the terminal rather than
 * instead of it: the replay keeps its in-memory state, a guest session (which
 * has no results page, since that route requires an account) gets the same
 * analysis, and the way back is one button that says so.
 */

import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";

import { computeStatistics } from "@/lib/backtest/statistics";
import type { PublicSessionState } from "@/lib/backtest/types";
import { formatSymbol } from "@/lib/market-data/symbols";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { SessionAnalyticsWorkbench } from "./SessionAnalyticsWorkbench";
import { StatsGrid } from "./StatsGrid";

export function SessionAnalyticsScreen({
  state,
  fullAccess,
  onClose,
}: {
  state: PublicSessionState;
  /** Pro gates the risk and timing views, as on the results page. */
  fullAccess: boolean;
  onClose: () => void;
}) {
  const containerRef = useModalBehavior<HTMLDivElement>({ open: true, onClose });

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
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Session analytics"
      data-testid="session-analytics-screen"
      // Scrolling belongs to this whole surface rather than an inner body, so
      // the workbench's own `sticky top-16` toolbar parks directly beneath the
      // h-16 header below instead of 64px under the top of a nested scroller.
      className="fixed inset-0 z-[110] overflow-y-auto bg-[var(--app-bg)]"
    >
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b app-border bg-[var(--app-panel)]/95 px-4 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-surface-950 transition-colors hover:bg-brand-400"
        >
          <ArrowLeft size={15} aria-hidden />
          Continue session
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">
            Session analytics
          </p>
          <h2 className="truncate text-sm font-bold">
            {state.config.name || "Backtest session"}
          </h2>
        </div>
        <div className="ml-auto hidden shrink-0 items-center gap-2 text-[11px] app-muted sm:flex">
          {(state.config.symbols ?? [state.config.symbol]).map((symbol) => (
            <span
              key={symbol}
              className="rounded-md border app-border bg-black/10 px-2 py-1 font-mono font-semibold"
            >
              {formatSymbol(symbol)}
            </span>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-12">
        {/* The dock's headline numbers still lead, so the glance the button used
            to answer is answered before any scrolling. */}
        <div className="pt-5">
          <StatsGrid stats={stats} />
        </div>

        <SessionAnalyticsWorkbench
          trades={state.closedTrades}
          equityCurve={state.equityCurve}
          startingBalance={state.config.startingBalance}
          fullAccess={fullAccess}
          currentSessionId={state.sessionId}
        />
      </div>
    </div>
  );
}
