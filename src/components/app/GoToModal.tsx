"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, Clock, Hourglass, Loader2, X } from "lucide-react";

import {
  TRADING_SESSIONS,
  nextCalendarBoundary,
  nextSessionEdge,
  previousDailyRange,
  previousSessionRange,
  psychologicalLevels,
  zoneParts,
  zoneWallClockToUtc,
  type GoToTarget,
  type PriceRange,
  type TradingSessionDefinition,
} from "@/lib/backtest/goto";
import { formatInZone, resolveZone } from "@/lib/chart/timezones";
import type { Candle } from "@/lib/market-data/types";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

/**
 * "Go to" — fast-forward the replay to a moment or a price.
 *
 * Three columns, because there are three ways a trader says where they want to
 * be: a clock time, a session, or a price. Everything offered is *ahead* of the
 * replay, and every level comes from candles already revealed — replay cannot
 * rewind, and a level taken from a bar the trader has not seen is hindsight.
 *
 * It is kept deliberately narrow. It opens over the chart the trader is deciding
 * from, so a dialog wide enough to be roomy is a dialog covering the reason they
 * opened it. Anything with two natural ends — a session's open and close, a
 * range's high and low — is one row with two buttons rather than two rows, which
 * halves the height and reads as the pair it is.
 *
 * Destinations that cannot be satisfied are disabled rather than hidden, so the
 * panel does not change shape between sessions, with the reason in the tooltip.
 */

interface GoToModalProps {
  open: boolean;
  onClose: () => void;
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
  /** False when nothing is open or pending, so no order can close. */
  canWaitForClose: boolean;
  busy: boolean;
  onJump: (target: GoToTarget, label: string) => void;
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
  return (
    <section className="flex min-w-0 flex-col rounded-lg border app-border">
      <h3 className="border-b app-border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] app-muted">
        {title}
      </h3>
      <div className="flex min-h-0 flex-1 flex-col p-1">{children}</div>
    </section>
  );
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
      className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-[var(--app-panel-2)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <span className="min-w-0 truncate">{label}</span>
      {detail && (
        <span className="shrink-0 font-mono text-[10px] app-muted">{detail}</span>
      )}
    </button>
  );
}

function Edge({
  icon: Icon,
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
      className="grid h-6 w-6 shrink-0 place-items-center rounded border app-border transition-colors hover:border-brand-400/50 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[var(--app-border)]"
    >
      <Icon size={12} aria-hidden />
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
    <div className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--app-panel-2)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px]">{label}</p>
        {hint && <p className="truncate font-mono text-[9px] app-muted">{hint}</p>}
      </div>
      <Edge {...first} />
      <Edge {...second} />
    </div>
  );
}

export function GoToModal({
  open,
  onClose,
  currentTime,
  currentPrice,
  pipSize,
  precision,
  candles,
  visibleIndex,
  timeZone,
  endTime,
  canWaitForClose,
  busy,
  onJump,
}: GoToModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useModalBehavior<HTMLElement>({
    open,
    onClose,
    initialFocus: closeRef,
  });
  const [expanded, setExpanded] = useState<"date" | "price" | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");

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
      (
        [
          ["Next day", "day"],
          ["Next week", "week"],
          ["Next month", "month"],
        ] as const
      ).map(([label, unit]) => {
        const timestamp = nextCalendarBoundary(currentTime, zone, unit);
        return { key: unit, label, timestamp, beyond: timestamp > endTime };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTime, endTime, zone],
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
    for (const session of TRADING_SESSIONS) {
      out.push({
        key: session.id,
        label: `Previous ${session.label}`,
        short: session.label,
        range: previousSessionRange(revealed, session, currentTime),
      });
    }
    return out;
  }, [open, revealed, zone, currentTime]);

  const levels = useMemo(
    () => (currentPrice == null ? [] : psychologicalLevels(currentPrice, pipSize, 2)),
    [currentPrice, pipSize],
  );

  if (!open) return null;

  /**
   * The dialog stays open while the jump runs, showing its progress line, and
   * the caller closes it once the replay has arrived. Closing on the click would
   * leave a long fast-forward running with nothing on screen to say so.
   */
  const jump = (target: GoToTarget, label: string) => onJump(target, label);

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

  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-surface-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="go-to-title"
        data-testid="go-to-modal"
        className="flex max-h-[min(32rem,88dvh)] w-full max-w-[44rem] flex-col overflow-hidden rounded-xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <h2 id="go-to-title" className="text-sm font-semibold tracking-tight">
              Go to …
            </h2>
            <p className="truncate text-[10px] app-muted">
              Runs the replay forward, filling stops and orders on the way. Now at{" "}
              {clock(currentTime)}.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close go to"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-3">
          <Column title="Time">
            {calendar.map((entry) => (
              <Row
                key={entry.key}
                label={entry.label}
                detail={clock(entry.timestamp)}
                disabled={busy || entry.beyond}
                title={
                  entry.beyond
                    ? "Past the end of this session's data."
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
              className={`rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
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
                  min={asInput(currentTime)}
                  max={asInput(endTime)}
                  onChange={(event) => setDateDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitDate();
                    }
                  }}
                  className="w-full rounded border app-border bg-transparent px-1.5 py-1 font-mono text-[10px] outline-none focus:border-brand-400"
                />
                <button
                  type="button"
                  disabled={!dateDraft || busy}
                  onClick={submitDate}
                  className="rounded bg-brand-500 px-2 py-1 text-[10px] font-semibold text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
                >
                  Go
                </button>
              </div>
            )}
          </Column>

          <Column title="Sessions">
            {TRADING_SESSIONS.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                currentTime={currentTime}
                endTime={endTime}
                busy={busy}
                clock={clock}
                onSelect={jump}
              />
            ))}
            <p className="mt-auto px-1.5 pt-1 text-[9px] leading-3 app-muted">
              Left button arrives at the open, right button at the close.
            </p>
          </Column>

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
              className={`rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
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
                  className="w-full rounded border app-border bg-transparent px-1.5 py-1 font-mono text-[10px] outline-none focus:border-brand-400"
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
                        className="rounded bg-[var(--app-panel-2)] px-1.5 py-0.5 font-mono text-[10px] app-muted hover:text-[var(--app-text)]"
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
                  className="rounded bg-brand-500 px-2 py-1 text-[10px] font-semibold text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
                >
                  Go
                </button>
              </div>
            )}
          </Column>
        </div>

        {busy && (
          <p
            role="status"
            className="flex shrink-0 items-center gap-1.5 border-t app-border px-3 py-1.5 text-[10px] app-muted"
          >
            <Loader2 size={11} className="animate-spin" aria-hidden /> Running the
            replay forward…
          </p>
        )}
      </section>
    </div>
  );
}

/** One session, with its open and its close as the two destinations. */
function SessionRow({
  session,
  currentTime,
  endTime,
  busy,
  clock,
  onSelect,
}: {
  session: TradingSessionDefinition;
  currentTime: number;
  endTime: number;
  busy: boolean;
  clock: (at: number) => string;
  onSelect: (target: GoToTarget, label: string) => void;
}) {
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
        ? `No upcoming ${session.label} ${kind}.`
        : at > endTime
          ? "Past the end of this session's data."
          : undefined,
    disabled: busy,
    onSelect,
  });

  return (
    <PairRow
      label={session.label}
      hint={session.hint}
      first={edge(nextSessionEdge(currentTime, session, "open"), "open", Clock)}
      second={edge(nextSessionEdge(currentTime, session, "close"), "close", Hourglass)}
    />
  );
}
