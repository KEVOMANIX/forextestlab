"use client";

import Link from "next/link";
import { BarChart3, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { computeStatistics } from "@/lib/backtest/statistics";
import type { PublicSessionState, TradeJournalUpdate } from "@/lib/backtest/types";
import { AccountSummary } from "./AccountSummary";
import { SessionClock } from "./SessionClock";
import { StatsGrid } from "./StatsGrid";
import { TradesTable } from "./TradesTable";
import { TradeJournalEditor } from "./TradeJournalEditor";
import { BookmarksPanel } from "./BookmarksPanel";

export type BottomPanelTab =
  | "position"
  | "trades"
  | "orders"
  | "statistics"
  | "notes"
  | "bookmarks";

type Tab = BottomPanelTab;

const TABS: { id: Exclude<Tab, "statistics">; label: string }[] = [
  { id: "position", label: "Open Positions" },
  { id: "orders", label: "Pending Orders" },
  { id: "trades", label: "Trades" },
  { id: "notes", label: "Journal" },
  { id: "bookmarks", label: "Bookmarks" },
];

interface BottomPanelProps {
  state: PublicSessionState;
  currentTime?: number | null;
  /** Zone the charts are displayed in, so every clock in the app agrees. */
  timeZone: string;
  initialNotes?: string;
  onSaveNotes: (notes: string) => void;
  busy: boolean;
  onCancelPending: (orderId: string) => void;
  onCloseAllPositions: () => void;
  onSaveTradeJournal: (journalId: string, journal: TradeJournalUpdate) => Promise<void> | void;
  onAddBookmark: () => void;
  onUpdateBookmark: (id: string, note: string) => void;
  onDeleteBookmark: (id: string) => void;
  onForkSession: () => void;
  /**
   * Opens the panel on a given tab from elsewhere in the app — the trade review
   * card's "Full journal". Carries a nonce so asking for the tab that is already
   * showing still re-expands a panel the trader has since collapsed.
   */
  revealTab?: { tab: BottomPanelTab; nonce: number } | null;
  /** Opens the prop-firm verdict from the challenge chip in the status bar. */
  onShowPropFirmVerdict?: () => void;
  /** Mask the account figures in the status bar. */
  balancesHidden?: boolean;
  onToggleBalances?: () => void;
}

export function BottomPanel({
  state,
  currentTime = null,
  timeZone,
  initialNotes = "",
  onSaveNotes,
  busy,
  onCancelPending,
  onCloseAllPositions,
  onSaveTradeJournal,
  onAddBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
  onForkSession,
  revealTab = null,
  onShowPropFirmVerdict,
  balancesHidden = false,
  onToggleBalances,
}: BottomPanelProps) {
  const [tab, setTab] = useState<Tab>("position");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!revealTab) return;
    setTab(revealTab.tab);
    setExpanded(true);
  }, [revealTab?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
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
        expanded ? (tab === "notes" || tab === "bookmarks" ? "h-[min(72dvh,620px)]" : "h-44 md:h-48") : "h-11"
      }`}
      aria-label="Session details"
    >
      {expanded && (
        <div
          id={`panel-${tab}`}
          role="group"
          aria-labelledby={tab === "statistics" ? "analytics-button" : `tab-${tab}`}
          className="min-h-0 flex-1 overflow-auto border-b app-border"
        >
          {tab === "position" &&
            (state.openPositions.length > 0 ? (
              <div>
                <div className="flex items-center justify-between border-b app-border bg-[var(--app-panel-solid)] px-3 py-2">
                  <span className="text-xs font-semibold">{openCount} open {openCount === 1 ? "position" : "positions"}</span>
                  <button type="button" onClick={onCloseAllPositions} disabled={busy} className="rounded-md border border-bear/40 bg-bear/10 px-3 py-1.5 text-xs font-semibold text-bear transition-colors hover:bg-bear/20 disabled:opacity-40">
                    Close all positions
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                  {/* The dock is short, so headers stick instead of scrolling away. */}
                  <thead className="sticky top-0 z-10 bg-[var(--app-panel-solid)] app-muted"><tr className="border-b app-border"><th scope="col" className="px-3 py-2">Side</th><th scope="col">Lots</th><th scope="col">Entry</th><th scope="col">SL</th><th scope="col">TP</th><th scope="col">Commission</th><th scope="col">Unrealised</th></tr></thead>
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
              </div>
            ) : (
              <p className="p-4 text-sm app-muted">No open positions.</p>
            ))}

          {tab === "trades" && <TradesTable trades={state.closedTrades} />}

          {tab === "orders" && (
            state.pendingOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--app-panel-solid)] app-muted">
                    <tr className="border-b app-border">
                      <th scope="col" className="px-3 py-2">Status</th><th scope="col">Type</th><th scope="col">Side</th>
                      <th scope="col">Lots</th><th scope="col">Price</th><th scope="col">Created</th><th scope="col">Updated</th>
                      <th scope="col">Expiry</th><th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.pendingOrders].reverse().map((order) => (
                      <tr key={order.id} className="border-b app-border font-mono">
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            order.status === "pending"
                              ? "bg-amber-400/15 text-amber-300"
                              : order.status === "activated"
                                ? "bg-brand-400/15 text-brand-300"
                                : "bg-white/[0.06] app-muted"
                          }`}>{order.status}</span>
                        </td>
                        <td className="uppercase">{order.orderType}</td>
                        <td className={order.direction === "long" ? "text-brand-300" : "text-bear"}>
                          {order.direction === "long" ? "BUY" : "SELL"}
                        </td>
                        <td>{order.lots}</td><td>{order.fillPrice ?? order.entryPrice}</td>
                        <td>{new Date(order.createdTime).toLocaleString()}</td>
                        <td>{new Date(order.updatedTime).toLocaleString()}</td>
                        <td>{order.expiresAt ? new Date(order.expiresAt).toLocaleString() : "GTC"}</td>
                        <td className="pr-3 text-right">
                          {order.status === "pending" && (
                            <button type="button" onClick={() => onCancelPending(order.id)} disabled={busy} className="rounded border border-bear/30 px-2 py-1 text-[10px] font-semibold text-bear hover:bg-bear/10 disabled:opacity-50">
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-sm app-muted">No pending orders.</p>
            )
          )}

          {tab === "statistics" && (
            <div className="p-4">
              <StatsGrid stats={stats} />
            </div>
          )}
          {tab === "bookmarks" && (
            <BookmarksPanel
              bookmarks={state.bookmarks}
              currentIndex={state.visibleIndex}
              anonymous={state.anonymous}
              busy={busy}
              onAdd={onAddBookmark}
              onUpdate={onUpdateBookmark}
              onDelete={onDeleteBookmark}
              onFork={onForkSession}
            />
          )}

          {tab === "notes" ? (
            <div>
              <TradeJournalEditor
                openPositions={state.openPositions}
                closedTrades={state.closedTrades}
                anonymous={state.anonymous}
                onSave={onSaveTradeJournal}
              />
              <div className="space-y-2 border-t app-border p-4">
              <label htmlFor="session-notes" className="text-xs app-muted">Session notes</label>
              <textarea
                id="session-notes"
                rows={3}
                className="app-input w-full resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Record your observations…"
              />
              <button type="button" className="btn-secondary" onClick={() => onSaveNotes(notes)} disabled={busy || state.anonymous}>
                Save session notes
              </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="scroll-x-thin flex h-9 shrink-0 items-center px-1.5 text-[11px]">
        {/* These are disclosure buttons, not tabs: the dock can be fully closed,
            and a tablist with nothing selected is invalid. */}
        <div aria-label="Session panels" className="flex h-full shrink-0 items-center">
          {TABS.map((item) => {
            const count = item.id === "position"
              ? openCount
              : item.id === "trades"
                ? state.closedTrades.length
                : item.id === "orders"
                  ? state.pendingOrders.filter((order) => order.status === "pending").length
                  : item.id === "bookmarks"
                    ? state.bookmarks.length
                  : null;
            const active = expanded && tab === item.id;
            return (
              <button
                key={item.id}
                aria-expanded={active}
                id={`tab-${item.id}`}
                aria-controls={`panel-${item.id}`}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`inline-flex h-full shrink-0 items-center gap-1.5 border-r app-border px-2.5 font-semibold transition-colors ${
                  active
                    ? "bg-brand-400/10 text-brand-300"
                    : "app-muted hover:text-[var(--app-text)]"
                }`}
              >
                {item.label}
                {count !== null && <span className="rounded bg-white/[0.08] px-1 font-mono">{count}</span>}
              </button>
            );
          })}
        </div>

        {state.anonymous && (
          <span className="hidden shrink-0 border-r app-border px-3 text-[10px] text-brand-300 xl:inline-flex">
            Guest session&nbsp;·&nbsp;
            <Link href="/sign-up" className="font-semibold underline">Create a free account</Link>
          </span>
        )}

        <div className="ml-auto flex h-full shrink-0 items-center">
          {/* Balance and equity matter on every screen size, so the read-out is
              always mounted and drops metrics by breakpoint instead of vanishing. */}
          <div className="flex h-full border-l app-border">
            <AccountSummary
              state={state}
              onShowVerdict={onShowPropFirmVerdict}
              hidden={balancesHidden}
              onToggleHidden={onToggleBalances}
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
            className="ml-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-brand-500 px-2.5 font-semibold text-surface-950 transition-colors hover:bg-brand-400"
            aria-expanded={expanded && tab === "statistics"}
            aria-controls="panel-statistics"
            aria-label="Analytics"
          >
            <BarChart3 size={13} aria-hidden />
            <span className="hidden sm:inline">Analytics</span>
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
