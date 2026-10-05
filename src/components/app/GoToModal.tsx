"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Clock,
  Hourglass,
  Settings2,
  X,
} from "lucide-react";

import {
  minutesToClock,
  nextCalendarBoundary,
  nextSessionEdge,
  previousCalendarBoundary,
  previousDailyRange,
  previousSessionEdge,
  previousSessionRange,
  psychologicalLevels,
  reachableMoments,
  tradingSessionsWithOverrides,
  zoneParts,
  zoneWallClockToUtc,
  type CalendarUnit,
  type GoToTarget,
  type PriceRange,
  type SessionHourOverrides,
  type TradingSessionDefinition,
} from "@/lib/backtest/goto";
import { formatInZone, resolveZone } from "@/lib/chart/timezones";
import { TimeZonePicker } from "./TimeZonePicker";
import type { Candle } from "@/lib/market-data/types";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { useCompactViewport } from "@/lib/ui/use-media-query";

/** Panel width on desktop — matches the old dialog's `max-w-[44rem]`. */
const PANEL_WIDTH_REM = 40;

const CALENDAR_UNITS: { unit: CalendarUnit; ahead: string; behind: string }[] = [
  { unit: "day", ahead: "Next day", behind: "Previous day" },
  { unit: "week", ahead: "Next week", behind: "Previous week" },
  { unit: "month", ahead: "Next month", behind: "Previous month" },
];

/** Sidebar navigation with explicit destination selection and editable session hours. */

interface GoToModalProps {
  theme?: "dark" | "light";
  open: boolean;
  onClose: () => void;
  /**
   * The "Go to" button's own bounding rect, captured on open, so the panel can
   * drop in right below it. Null falls back to a fixed spot near the top of
   * the chart — the button no longer being in the DOM at open time, say.
   */
  anchor: { left: number; bottom: number } | null;
  /** Market moment the replay is sitting on. */
  currentTime: number;
  /** Last revealed close, for seeding the price field and the round levels. */
  currentPrice: number | null;
  pipSize: number;
  precision: number;
  /** The session's loaded series, oldest first. Only `visibleIndex` is revealed. */
  candles: Candle[];
  visibleIndex: number;
  /** Chart's display zone. Day, week and month boundaries are read in it. */
  timeZone: string;
  /** Last moment this session holds data for. */
  endTime: number;
  /** A trader's own hours for the named sessions, keyed by session id. */
  sessionHours: SessionHourOverrides;
  /** False when nothing is open or pending, so no order can close. */
  canWaitForClose: boolean;
  busy: boolean;
  onJump: (target: GoToTarget, label: string) => void;
  /**
   * Opens the time-zone setting. Every clock time here is read in the chart's
   * zone, so it is the one preference that changes what this dialog says.
   */
  onSessionHoursChange: (hours: SessionHourOverrides) => void;
}

interface EdgeButton {
  icon: typeof Clock;
  label: string;
  /** Null when there is nothing to go to; the tooltip explains why. */
  target: GoToTarget | null;
  detail?: string;
  unavailable?: string;
  disabled?: boolean;
  onSelect: (target: GoToTarget, label: string) => void;
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return <section aria-label={title} className="flex min-w-0 flex-col gap-2">{children}</section>;
}

/** A single destination: a label, the value it resolves to, one click. */
function Row({
  label,
  detail,
  disabled,
  title,
  onSelect,
}: {
  label: string;
  detail?: string;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? detail ?? label}
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-[var(--app-panel-2)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <span className="min-w-0 truncate">{label}</span>
      {detail && (
        <span className="shrink-0 font-mono text-xs app-muted">{detail}</span>
      )}
    </button>
  );
}

function Edge({
  icon,
  label,
  target,
  detail,
  unavailable,
  disabled,
  onSelect,
}: EdgeButton) {
  return (
    <button
      type="button"
      disabled={disabled || !target || Boolean(unavailable)}
      aria-label={`Go to ${label}`}
      title={unavailable ?? (detail ? `${label} — ${detail}` : label)}
      onClick={() => target && onSelect(target, label)}
      className="min-h-9 min-w-14 shrink-0 rounded-md border app-border px-2 text-xs transition-colors hover:bg-[var(--app-panel-2)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {icon === Clock ? "Open" : icon === Hourglass ? "Close" : icon === ArrowUpToLine ? "High" : "Low"}
    </button>
  );
}

/**
 * A name with two destinations — the two ends of a session, or the high and low
 * of a range. One row, two small buttons: they are one thing with two sides, and
 * a trader picks the side rather than the row.
 */
function PairRow({
  label,
  hint,
  first,
  second,
}: {
  label: string;
  hint?: string;
  first: EdgeButton;
  second: EdgeButton;
}) {
  return (
    <div className="flex items-center gap-2 rounded px-1.5 py-3 hover:bg-[var(--app-panel-2)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{label}</p>
        {hint && <p className="truncate font-mono text-xs app-muted">{hint}</p>}
      </div>
      <Edge {...first} />
      <Edge {...second} />
    </div>
  );
}

export function GoToModal({
  open,
  theme = "dark",
  onClose,
  anchor,
  currentTime,
  currentPrice,
  pipSize,
  precision,
  candles,
  visibleIndex,
  timeZone,
  endTime,
  sessionHours,
  canWaitForClose,
  busy,
  onJump,
  onSessionHoursChange,
}: GoToModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useModalBehavior<HTMLElement>({
    open,
    onClose,
    initialFocus: closeRef,
  });
  const compact = useCompactViewport();
  const [direction, setDirection] = useState<"ahead" | "behind">("ahead");
  const [expanded, setExpanded] = useState<"date" | "price" | null>(null);
  const [tab, setTab] = useState<"time" | "sessions" | "prices" | "settings">("sessions");
  const [selection, setSelection] = useState<{ target: GoToTarget; label: string } | null>(null);
  const [hoursDraft, setHoursDraft] = useState<SessionHourOverrides>({});
  const [dateDraft, setDateDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  useEffect(() => { if (open) { setSelection(null); setTab("sessions"); } }, [open]);

  /**
   * The earliest moment this session has ever loaded — the floor a "Behind"
   * jump cannot cross. Not `visibleIndex`: revealing only ever appends, so the
   * loaded series' own first candle is the true floor regardless of how far
   * the replay has advanced.
   */
  const loadedFloor = candles[0]?.timestamp ?? currentTime;

  /** The four named sessions, with any of the trader's own hours applied. */
  const sessions = useMemo(
    () => tradingSessionsWithOverrides(sessionHours),
    [sessionHours],
  );

  const zone = resolveZone(timeZone);
  const clock = (at: number) =>
    formatInZone(at, timeZone, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  const price = (value: number) => value.toFixed(precision);

  /**
   * The revealed slice, copied only while the dialog is open.
   *
   * The loaded series runs to tens of thousands of candles and this component
   * stays mounted for the life of the session, so slicing unconditionally would
   * copy it on every replay tick to feed a dialog nobody is looking at. Playback
   * is held while the dialog is open, so `visibleIndex` does not move here.
   */
  const revealed = useMemo(
    () => (open ? candles.slice(0, visibleIndex + 1) : []),
    [open, candles, visibleIndex],
  );

  const calendar = useMemo(
    () =>
      CALENDAR_UNITS.map(({ unit, ahead, behind }) => {
        const timestamp =
          direction === "ahead"
            ? nextCalendarBoundary(currentTime, zone, unit)
            : previousCalendarBoundary(currentTime, zone, unit);
        const beyond =
          direction === "ahead" ? timestamp > endTime : timestamp < loadedFloor;
        return { key: unit, label: direction === "ahead" ? ahead : behind, timestamp, beyond };
      }),
    [currentTime, direction, endTime, loadedFloor, zone],
  );

  /** Ranges behind the replay, one per source, each with a high and a low. */
  const ranges = useMemo(() => {
    if (!open) return [];
    const out: { key: string; label: string; short: string; range: PriceRange | null }[] = [
      {
        key: "daily",
        label: "Previous day",
        short: "day",
        range: previousDailyRange(revealed, zone, currentTime),
      },
    ];
    for (const session of sessions) {
      out.push({
        key: session.id,
        label: `Previous ${session.label}`,
        short: session.label,
        range: previousSessionRange(revealed, session, currentTime),
      });
    }
    return out;
  }, [open, revealed, sessions, zone, currentTime]);

  const levels = useMemo(
    () => (currentPrice == null ? [] : psychologicalLevels(currentPrice, pipSize, 2)),
    [currentPrice, pipSize],
  );

  /**
   * Notable days this session can still reach.
   *
   * Almost always empty, because a session covers weeks and these are spread
   * over years — which is the honest answer, and better than listing a decade of
   * dates that would each refuse the click.
   */
  const moments = useMemo(
    () =>
      open
        ? reachableMoments(
            currentTime,
            direction === "ahead" ? endTime : loadedFloor,
            zone,
            direction,
          )
        : [],
    [open, currentTime, direction, endTime, loadedFloor, zone],
  );

  if (!open) return null;

  /** Selection returns to the chart immediately; its right-edge loader reports progress. */
  const jump = (target: GoToTarget, label: string) => setSelection({ target, label });

  const submitDate = () => {
    if (!dateDraft) return;
    // A datetime-local value is a wall clock with no zone. It is read in the
    // chart's zone, which is the zone the trader just read the axis in.
    const [datePart, timePart = "00:00"] = dateDraft.split("T");
    const [year, month, day] = (datePart ?? "").split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    if (!year || !month || !day) return;
    const timestamp = zoneWallClockToUtc(zone, year, month, day, hour ?? 0, minute ?? 0);
    jump({ kind: "time", timestamp }, clock(timestamp));
  };

  const submitPrice = () => {
    const value = Number(priceDraft);
    if (!Number.isFinite(value) || value <= 0) return;
    jump({ kind: "price", price: value }, price(value));
  };

  /** Bounds for the date field: only the span the session can still replay. */
  const asInput = (at: number) => {
    const parts = zoneParts(at, zone);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
  };

  const rangeEdge = (
    entry: { label: string; short: string; range: PriceRange | null },
    side: "high" | "low",
  ): EdgeButton => ({
    icon: side === "high" ? ArrowUpToLine : ArrowDownToLine,
    label: `${entry.label} ${side}`,
    target: entry.range ? { kind: "price", price: entry.range[side] } : null,
    detail: entry.range ? price(entry.range[side]) : undefined,
    unavailable: entry.range
      ? undefined
      : `No completed ${entry.short} has been replayed yet.`,
    disabled: busy,
    onSelect: jump,
  });

  // Anchored below the button that opened it, clamped so it never runs off
  // the right or bottom edge. Compact viewports get a bottom sheet instead —
  // there is no room below a header button for a panel this tall.
  const panelStyle: CSSProperties = compact
    ? { left: "0.75rem", right: "0.75rem", bottom: "0.5rem", top: "auto" }
    : {
        left: anchor
          ? Math.max(16, Math.min(anchor.left, window.innerWidth - PANEL_WIDTH_REM * 16 - 16))
          : "50%",
        top: anchor
          ? Math.min(anchor.bottom + 8, Math.max(16, window.innerHeight - 560))
          : "4rem",
        transform: anchor ? undefined : "translateX(-50%)",
        width: `min(${PANEL_WIDTH_REM}rem, calc(100vw - 2rem))`,
      };

  return (
    <>
      {/*
        No dimming scrim — the whole point is that the chart (and the jump's
        own progress on it) stays visible while this is open. A transparent
        layer still catches an outside click to dismiss it.
      */}
      <div className="fixed inset-0 z-[129]" onMouseDown={onClose} aria-hidden />
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="go-to-title"
        data-testid="go-to-modal"
        style={panelStyle}
        className="fixed z-[130] flex max-h-[min(38rem,88dvh)] flex-col overflow-hidden rounded-xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <h2 id="go-to-title" className="text-sm font-semibold tracking-tight">
              {tab === "settings" ? "Session settings" : "Go to"}
            </h2>
            <p className="truncate text-xs app-muted">
              {tab === "settings" ? "Set your session hours and time zones." : `Replay at ${clock(currentTime)} · ${timeZone}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              hidden={tab === "settings"}
              style={{ display: tab === "settings" ? "none" : undefined }}
              onClick={() => { setHoursDraft(sessionHours); setTab("settings"); setSelection(null); }}
              aria-label="Session settings"
              title="Times are read in the chart's zone — change it"
              className="flex min-h-9 items-center gap-2 rounded-md px-2 text-xs app-muted hover:bg-[var(--app-panel-2)]"
            >
              <Settings2 size={14} aria-hidden /> Settings
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close go to"
              className="grid h-7 w-7 place-items-center rounded-md app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row">
          <nav style={{ display: tab === "settings" ? "none" : undefined }} aria-label="Go to destinations" className="flex shrink-0 gap-1 border-b app-border bg-[var(--app-panel-2)] p-3 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r">
            {([['sessions', 'Sessions'], ['time', 'Date & time'], ['prices', 'Price levels']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); setSelection(null); }} className={`rounded-md px-3 py-2 text-left text-sm ${tab === key ? 'bg-[var(--app-panel-solid)] font-semibold' : 'app-muted'}`}>{label}</button>)}
          </nav>
          <div className="min-w-0 flex-1 p-4">
        <div style={{ display: tab === "settings" || tab === "prices" ? "none" : undefined }} className="mb-3 flex shrink-0 gap-1" role="group" aria-label="Direction">
          {(["ahead", "behind"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={direction === value}
              onClick={() => { setDirection(value); setSelection(null); }}
              className={`flex-1 rounded-md px-2 py-1 text-sm font-semibold transition-colors ${
                direction === value
                  ? "bg-brand-500 text-surface-950"
                  : "app-muted hover:bg-[var(--app-panel-2)]"
              }`}
            >
              {value === "ahead" ? "Forward" : "Backward"}
            </button>
          ))}
        </div>

        <div className="min-h-[260px]">
          {direction === "behind" && tab !== "prices" && tab !== "settings" && <p className="mb-3 text-xs app-muted">Rewinding undoes trades opened after the destination.</p>}
          <div hidden={tab !== "time"}>
          <Column title="Time">
            {calendar.map((entry) => (
              <Row
                key={entry.key}
                label={entry.label}
                detail={clock(entry.timestamp)}
                disabled={busy || entry.beyond}
                title={
                  entry.beyond
                    ? direction === "ahead"
                      ? "Past the end of this session's data."
                      : "Before anything this session has loaded."
                    : `${entry.label} — ${clock(entry.timestamp)}`
                }
                onSelect={() =>
                  jump({ kind: "time", timestamp: entry.timestamp }, entry.label)
                }
              />
            ))}
            <button
              type="button"
              onClick={() => setExpanded(expanded === "date" ? null : "date")}
              aria-expanded={expanded === "date"}
              className={`rounded px-1.5 py-1 text-left text-sm transition-colors ${
                expanded === "date"
                  ? "bg-brand-400/10 text-brand-300"
                  : "hover:bg-[var(--app-panel-2)]"
              }`}
            >
              Pick a date and time…
            </button>
            {expanded === "date" && (
              <div className="mt-1 flex flex-col gap-1 rounded border app-border p-1.5">
                <input
                  autoFocus
                  type="datetime-local"
                  value={dateDraft}
                  min={asInput(loadedFloor)}
                  max={asInput(endTime)}
                  onChange={(event) => setDateDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitDate();
                    }
                  }}
                  className="w-full rounded border app-border bg-transparent px-1.5 py-1 font-mono text-xs outline-none focus:border-brand-400"
                />
                <button
                  type="button"
                  disabled={!dateDraft || busy}
                  onClick={submitDate}
                  className="rounded bg-brand-500 px-2 py-1 text-xs font-semibold text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
                >
                  Use this date
                </button>
              </div>
            )}

            {/* Notable days, when this session happens to contain one. */}
            <div hidden={moments.length === 0} className="mt-4 border-t app-border pt-2">
              <p className="px-1.5 text-xs font-semibold uppercase tracking-[0.14em] app-muted">
                Historical moments
              </p>
              {moments.length === 0 ? (
                <p className="px-1.5 pt-0.5 text-xs leading-3 app-muted">
                  {direction === "ahead"
                    ? "None inside this session, ahead of the replay."
                    : "None inside this session, behind the replay."}
                </p>
              ) : (
                moments.map(({ moment, timestamp }) => (
                  <Row
                    key={moment.id}
                    label={moment.label}
                    detail={moment.date}
                    disabled={busy}
                    title={`${moment.label} — ${clock(timestamp)}`}
                    onSelect={() => jump({ kind: "time", timestamp }, moment.label)}
                  />
                ))
              )}
            </div>
          </Column>

          </div>
          <div hidden={tab !== "sessions"}>
          <Column title="Sessions">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                currentTime={currentTime}
                endTime={endTime}
                loadedFloor={loadedFloor}
                direction={direction}
                busy={busy}
                clock={clock}
                onSelect={jump}
              />
            ))}
            <p className="mt-auto px-1.5 pt-1 text-xs leading-3 app-muted">
              Hours follow each session’s time zone. Change them in Settings.
            </p>
          </Column>

          </div>
          <div hidden={tab !== "prices"}>
          <p className="mb-3 text-xs app-muted">Move forward until price reaches a level.</p>
          <Column title="Prices">
            {ranges.map((entry) => (
              <PairRow
                key={entry.key}
                label={entry.label}
                hint={
                  entry.range
                    ? `${price(entry.range.high)} / ${price(entry.range.low)}`
                    : "not replayed yet"
                }
                first={rangeEdge(entry, "high")}
                second={rangeEdge(entry, "low")}
              />
            ))}

            <Row
              label="Any position closes"
              detail="next exit"
              disabled={busy || !canWaitForClose}
              title={
                canWaitForClose
                  ? "Stops on the first candle that closes a position."
                  : "Nothing is open that could close."
              }
              onSelect={() => jump({ kind: "position-close" }, "the next exit")}
            />

            <button
              type="button"
              onClick={() => setExpanded(expanded === "price" ? null : "price")}
              aria-expanded={expanded === "price"}
              className={`rounded px-1.5 py-1 text-left text-sm transition-colors ${
                expanded === "price"
                  ? "bg-brand-400/10 text-brand-300"
                  : "hover:bg-[var(--app-panel-2)]"
              }`}
            >
              Pick a price…
            </button>
            {expanded === "price" && (
              <div className="mt-1 flex flex-col gap-1 rounded border app-border p-1.5">
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={priceDraft}
                  placeholder={currentPrice == null ? "0.00" : price(currentPrice)}
                  onChange={(event) =>
                    setPriceDraft(event.target.value.replace(/[^\d.]/g, ""))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitPrice();
                    }
                  }}
                  className="w-full rounded border app-border bg-transparent px-1.5 py-1 font-mono text-xs outline-none focus:border-brand-400"
                />
                {/* Round numbers as a shortcut rather than a section of their
                    own: they are just prices, and anyone who wants one is
                    already reaching for the price field. */}
                {levels.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {levels.map((level) => (
                      <button
                        key={level}
                        type="button"
                        title="Round number"
                        onClick={() => setPriceDraft(price(level))}
                        className="rounded bg-[var(--app-panel-2)] px-1.5 py-0.5 font-mono text-xs app-muted hover:text-[var(--app-text)]"
                      >
                        {price(level)}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!priceDraft || busy}
                  onClick={submitPrice}
                  className="rounded bg-brand-500 px-2 py-1 text-xs font-semibold text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
                >
                  Use this price
                </button>
              </div>
            )}
          </Column>
          </div>
          {tab === "settings" && <div>{tradingSessionsWithOverrides(hoursDraft).map(session => <div key={session.id} className="border-b app-border py-3"><div className="mb-2 text-sm font-medium">{session.label}</div><div className="grid grid-cols-2 gap-2">{([['openMinutes', 'Open'], ['closeMinutes', 'Close']] as const).map(([key, label]) => <label key={key} className="text-xs app-muted">{label}<input type="time" aria-label={`${session.label} ${label}`} value={minutesToClock(session[key])} onChange={event => { if (!event.target.value) return; const [h = 0, m = 0] = event.target.value.split(':').map(Number); setHoursDraft(previous => ({ ...previous, [session.id]: { openMinutes: session.openMinutes, closeMinutes: session.closeMinutes, zone: session.zone, [key]: h * 60 + m } })); }} className="mt-1 block w-full rounded-md border app-border bg-[var(--app-panel-2)] p-2 text-sm" /></label>)}</div><div className="mt-2 text-xs app-muted"><span className="mb-1 block">Time zone</span><TimeZonePicker fieldLabel={`${session.label} time zone`} zone={session.zone} at={currentTime} theme={theme} onChange={zone => setHoursDraft(previous => ({ ...previous, [session.id]: { openMinutes: session.openMinutes, closeMinutes: session.closeMinutes, zone } }))} /></div></div>)}<button type="button" onClick={() => setHoursDraft({})} className="mt-3 text-xs underline app-muted">Restore default sessions</button></div>}
        </div>

        </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t app-border bg-[var(--app-panel-2)] px-4 py-3">
          <p className="min-w-0 text-xs app-muted" role="status">{tab === "settings" ? "Session hours are saved with your chart preferences." : selection ? `${selection.label}${selection.target.kind === "time" ? ` · ${clock(selection.target.timestamp)}` : ""}` : "Choose a destination"}</p>
          {tab === "settings" ? <button type="button" onClick={() => { onSessionHoursChange(hoursDraft); setTab("sessions"); }} className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-surface-950">Save settings</button> : <button type="button" disabled={!selection || busy} onClick={() => { if (selection) { onJump(selection.target, selection.label); setSelection(null); } }} className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-surface-950 disabled:opacity-40">Go to selection</button>}
        </footer>
      </section>
    </>
  );
}

/** One session, with its open and its close as the two destinations. */
function SessionRow({
  session,
  currentTime,
  endTime,
  loadedFloor,
  direction,
  busy,
  clock,
  onSelect,
}: {
  session: TradingSessionDefinition;
  currentTime: number;
  endTime: number;
  loadedFloor: number;
  direction: "ahead" | "behind";
  busy: boolean;
  clock: (at: number) => string;
  onSelect: (target: GoToTarget, label: string) => void;
}) {
  const ahead = direction === "ahead";
  const edge = (
    at: number | null,
    kind: "open" | "close",
    icon: typeof Clock,
  ): EdgeButton => ({
    icon,
    label: `${session.label} ${kind}`,
    target: at == null ? null : { kind: "time", timestamp: at },
    detail: at == null ? undefined : clock(at),
    unavailable:
      at == null
        ? `No ${ahead ? "upcoming" : "prior"} ${session.label} ${kind}.`
        : ahead
          ? at > endTime
            ? "Past the end of this session's data."
            : undefined
          : at < loadedFloor
            ? "Before anything this session has loaded."
            : undefined,
    disabled: busy,
    onSelect,
  });

  const openAt = ahead
    ? nextSessionEdge(currentTime, session, "open")
    : previousSessionEdge(currentTime, session, "open");
  const closeAt = ahead
    ? nextSessionEdge(currentTime, session, "close")
    : previousSessionEdge(currentTime, session, "close");

  return (
    <PairRow
      label={session.label}
      hint={session.hint}
      first={edge(openAt, "open", Clock)}
      second={edge(closeAt, "close", Hourglass)}
    />
  );
}
