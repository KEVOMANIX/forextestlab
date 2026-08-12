"use client";

/**
 * Economic calendar panel — docked on the workspace's right edge.
 *
 * Search or filter for a release across the session's own date range and jump
 * the replay straight to it, instead of scrubbing the time axis by eye looking
 * for a badge. Scoped to the currencies the open charts actually trade — the
 * same set each pane's own badges use — so it doesn't list releases for a
 * currency nobody on this workspace can act on. Jumping reuses the same `onJump` the "Go to" dialog drives, so
 * the same constraint applies: a replay only goes forward, never back past
 * what it has already revealed. A release behind the playhead stays in the
 * list rather than disappearing — its "Jump" button is simply disabled, with
 * the reason in its tooltip.
 */

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import type { GoToTarget } from "@/lib/backtest/goto";
import {
  formatEventTime,
  formatFigure,
  hasReportedFigures,
  revealAt,
} from "@/lib/economic-calendar/format";
import type { CalendarEvent, EventImportance } from "@/lib/economic-calendar/types";
import { CurrencyFlag } from "./CurrencyFlag";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The session's own bounds — a jump can never land outside them. */
  rangeStart: number;
  rangeEnd: number;
  /** Last candle the replay has revealed. Releases up to here are shown as
   *  they actually turned out; releases past it are masked and un-jumpable. */
  currentTime: number;
  /** Display zone, so a release's time agrees with the chart's own axis. */
  zone: string;
  /**
   * Currencies traded across the workspace's own charts — the same set each
   * pane's badges already use. Releases for currencies nobody has open are
   * just noise here, so the panel narrows to this set rather than listing
   * every release in the window.
   */
  currencies: string[];
  /** True while a jump (or any other session action) is already in flight. */
  busy: boolean;
  onJump: (target: GoToTarget, label: string) => void;
}

const IMPORTANCE_CHOICES: { value: EventImportance; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium+" },
  { value: "low", label: "All" },
];

interface FetchState {
  events: CalendarEvent[];
  loading: boolean;
  failed: boolean;
  truncated: boolean;
}

export function EconomicCalendarPanel({
  open,
  onClose,
  rangeStart,
  rangeEnd,
  currentTime,
  zone,
  currencies,
  busy,
  onJump,
}: Props) {
  const [query, setQuery] = useState("");
  const [minImportance, setMinImportance] = useState<EventImportance>("medium");
  const [{ events, loading, failed, truncated }, setFetchState] = useState<FetchState>({
    events: [],
    loading: false,
    failed: false,
    truncated: false,
  });

  // Fetched once per (range, importance) — the panel is a lookup over a fixed
  // window, not a live feed, so there is nothing here that needs polling the
  // way the chart's own badges do.
  const currencyKey = currencies.join(",");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFetchState((prev) => ({ ...prev, loading: true, failed: false }));
    const params = new URLSearchParams({
      from: String(Math.floor(rangeStart)),
      to: String(Math.ceil(rangeEnd)),
      importance: minImportance,
      currencies: currencyKey,
    });
    fetch(`/api/calendar/events?${params}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { ok?: boolean; events?: CalendarEvent[]; truncated?: boolean }) => {
        if (cancelled) return;
        if (!data.ok || !Array.isArray(data.events)) {
          setFetchState({ events: [], loading: false, failed: true, truncated: false });
          return;
        }
        setFetchState({
          events: data.events,
          loading: false,
          failed: false,
          truncated: data.truncated === true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFetchState({ events: [], loading: false, failed: true, truncated: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, rangeStart, rangeEnd, minImportance, currencyKey]);

  // Filtered client-side rather than re-fetched per keystroke: a session's
  // window is at most a few hundred releases, well within what one page holds.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter(
      (event) =>
        event.name.toLowerCase().includes(needle) ||
        event.currency.toLowerCase().includes(needle) ||
        (event.country ?? "").toLowerCase().includes(needle),
    );
  }, [events, query]);

  if (!open) return null;

  return (
    <aside
      aria-label="Economic calendar"
      className="hidden w-80 shrink-0 flex-col border-l app-border bg-[var(--app-panel)] md:flex"
    >
      <div className="flex items-center justify-between gap-2 border-b app-border px-3 py-2">
        <h2 className="text-[13px] font-semibold">Economic calendar</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close economic calendar"
          className="grid h-7 w-7 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)]"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="space-y-2 border-b app-border px-3 py-2">
        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 app-muted"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search releases or currency…"
            className="w-full rounded-md border app-border bg-[var(--app-panel-2)] py-1.5 pl-7 pr-2 text-[13px] outline-none focus:border-brand-400"
          />
        </label>
        <div className="flex gap-1" role="group" aria-label="Minimum impact">
          {IMPORTANCE_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              aria-pressed={minImportance === choice.value}
              onClick={() => setMinImportance(choice.value)}
              className={`flex-1 rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors ${
                minImportance === choice.value
                  ? "bg-brand-500 text-surface-950"
                  : "app-muted hover:bg-[var(--app-panel-2)]"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" data-testid="economic-calendar-panel-list">
        {loading && <p className="p-3 text-[12.5px] app-muted">Loading…</p>}
        {!loading && !failed && truncated && (
          <p className="border-b app-border bg-amber-400/10 px-3 py-2 text-[11.5px] text-amber-200">
            This range contains more than 1,500 releases. Showing the highest-impact results;
            shorten the session range for a complete list.
          </p>
        )}
        {!loading && failed && (
          <p className="p-3 text-[12.5px] app-muted">Could not load the calendar.</p>
        )}
        {!loading && !failed && filtered.length === 0 && (
          <p className="p-3 text-[12.5px] app-muted">No releases match.</p>
        )}
        {!loading &&
          !failed &&
          filtered.map((raw) => {
            const event = revealAt(raw, currentTime);
            const past = raw.timestamp <= currentTime;
            const showFigures = hasReportedFigures(raw);
            return (
              <div
                key={event.id}
                data-testid="economic-calendar-panel-row"
                className="flex items-start gap-2 border-b app-border px-3 py-2"
              >
                <CurrencyFlag currency={event.currency} size={16} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold">{event.name}</p>
                  <p className="text-[11px] app-muted">{formatEventTime(event, zone)}</p>
                  {showFigures && (
                    <p className="mt-0.5 truncate text-[11px] app-muted">
                      A {formatFigure(event.actual, event)} · F {formatFigure(event.forecast, event)} ·
                      P {formatFigure(event.previous, event)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy || past}
                  title={
                    past
                      ? "Already behind the replay — it cannot rewind to it"
                      : `Jump the replay to ${event.name}`
                  }
                  onClick={() =>
                    onJump(
                      { kind: "time", timestamp: raw.timestamp },
                      `${event.currency} ${event.name}`,
                    )
                  }
                  className="shrink-0 rounded-md border app-border px-2 py-1 text-[11px] font-semibold app-muted transition-colors hover:bg-[var(--app-panel-2)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Jump
                </button>
              </div>
            );
          })}
      </div>
    </aside>
  );
}
