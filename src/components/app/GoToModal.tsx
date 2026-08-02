"use client";

import { useMemo, useRef, useState } from "react";
import { Clock, Hourglass, Loader2, X } from "lucide-react";

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
  type TradingSessionDefinition,
} from "@/lib/backtest/goto";
import { formatInZone, resolveZone } from "@/lib/chart/timezones";
import type { Candle } from "@/lib/market-data/types";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

/**
 * "Go to" — fast-forward the replay to a moment or a price.
 *
 * Three columns because there are three ways a trader describes where they want
 * to be: a clock time, a session, or a price. Everything offered here is
 * *ahead* of the replay, and every level is derived from candles already
 * revealed: replay cannot rewind, and a level taken from a bar the trader has
 * not seen would be hindsight.
 *
 * Rows that cannot be satisfied — a session range with no data behind it, a
 * position close with nothing open — are disabled rather than hidden, so the
 * panel does not change shape between sessions and the reason is in the tooltip.
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

/** A row in one of the three columns. */
interface Choice {
  key: string;
  label: string;
  /** Second line: the resolved time or price, so the jump is never a surprise. */
  detail?: string;
  target?: GoToTarget;
  /** Why the row cannot be used, shown as its title. */
  unavailable?: string;
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border app-border bg-[var(--app-panel-2)]/40">
      <header className="flex items-center justify-between gap-2 border-b app-border px-3 py-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">
          {title}
        </h3>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 p-1.5">{children}</div>
    </section>
  );
}

function ChoiceRow({
  choice,
  busy,
  onSelect,
}: {
  choice: Choice;
  busy: boolean;
  onSelect: (choice: Choice) => void;
}) {
  const disabled = busy || !choice.target || Boolean(choice.unavailable);
  return (
    <button
      type="button"
      disabled={disabled}
      title={choice.unavailable ?? choice.detail ?? choice.label}
      onClick={() => onSelect(choice)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--app-panel-2)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span className="min-w-0 truncate text-sm">{choice.label}</span>
      {choice.detail && (
        <span className="shrink-0 font-mono text-[11px] app-muted">{choice.detail}</span>
      )}
    </button>
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
  const firstRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useModalBehavior<HTMLElement>({
    open,
    onClose,
    initialFocus: firstRef,
  });
  const [expanded, setExpanded] = useState<"date" | "price" | "levels" | null>(null);
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

  const specific = useMemo<Choice[]>(() => {
    const rows: { key: string; label: string; unit: "day" | "week" | "month" }[] = [
      { key: "day", label: "Next day open", unit: "day" },
      { key: "week", label: "Next week open", unit: "week" },
      { key: "month", label: "Next month open", unit: "month" },
    ];
    return rows.map(({ key, label, unit }) => {
      const timestamp = nextCalendarBoundary(currentTime, zone, unit);
      return {
        key,
        label,
        detail: clock(timestamp),
        target: { kind: "time", timestamp },
        unavailable:
          timestamp > endTime
            ? "Past the end of this session's data."
            : undefined,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, endTime, timeZone, zone]);

  const crosses = useMemo<Choice[]>(() => {
    const rows: Choice[] = [];
    const daily = previousDailyRange(revealed, zone, currentTime);
    for (const edge of ["high", "low"] as const) {
      const level = daily?.[edge] ?? null;
      rows.push({
        key: `daily-${edge}`,
        label: `Previous daily ${edge}`,
        detail: level == null ? undefined : price(level),
        target: level == null ? undefined : { kind: "price", price: level },
        unavailable:
          level == null ? "No completed day has been replayed yet." : undefined,
      });
    }
    for (const session of TRADING_SESSIONS) {
      const range = previousSessionRange(revealed, session, currentTime);
      for (const edge of ["high", "low"] as const) {
        const level = range?.[edge] ?? null;
        rows.push({
          key: `${session.id}-${edge}`,
          label: `Previous ${session.label} ${edge}`,
          detail: level == null ? undefined : price(level),
          target: level == null ? undefined : { kind: "price", price: level },
          unavailable:
            level == null
              ? `No completed ${session.label} session has been replayed yet.`
              : undefined,
        });
      }
    }
    rows.push({
      key: "position-close",
      label: "Any position closes",
      detail: "next exit",
      target: canWaitForClose ? { kind: "position-close" } : undefined,
      unavailable: canWaitForClose
        ? undefined
        : "Nothing is open that could close.",
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWaitForClose, currentTime, precision, revealed, zone]);

  const levels = useMemo(
    () =>
      currentPrice == null ? [] : psychologicalLevels(currentPrice, pipSize, 3),
    [currentPrice, pipSize],
  );

  if (!open) return null;

  /**
   * The dialog stays open while the jump runs, showing its progress footer, and
   * the caller closes it once the replay has arrived. Closing on the click would
   * leave a long fast-forward running with nothing on screen to say so.
   */
  const jump = (target: GoToTarget, label: string) => onJump(target, label);
  const select = (choice: Choice) => {
    if (!choice.target) return;
    jump(choice.target, choice.label);
  };

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
  const dateBounds = () => {
    const asInput = (at: number) => {
      const parts = zoneParts(at, zone);
      const pad = (value: number) => String(value).padStart(2, "0");
      return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
    };
    return { min: asInput(currentTime), max: asInput(endTime) };
  };

  const bounds = dateBounds();

  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-surface-950/80 p-4 backdrop-blur-sm"
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
        className="flex max-h-[min(44rem,90dvh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="go-to-title" className="text-lg font-semibold tracking-tight">
              Go to …
            </h2>
            <p className="mt-1 truncate text-xs app-muted">
              Replay runs forward to the target, filling stops, targets and pending
              orders on the way. Now at {clock(currentTime)}.
            </p>
          </div>
          <button
            ref={firstRef}
            type="button"
            onClick={onClose}
            aria-label="Close go to"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 pb-5 sm:px-6 md:grid-cols-3">
          <Column title="Specific">
            <button
              type="button"
              onClick={() => setExpanded(expanded === "date" ? null : "date")}
              aria-expanded={expanded === "date"}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                expanded === "date" ? "bg-brand-400/10 text-brand-300" : "hover:bg-[var(--app-panel-2)]"
              }`}
            >
              Custom date …
            </button>
            {expanded === "date" && (
              <div className="mb-1 flex flex-col gap-1.5 rounded-lg border app-border p-2">
                <input
                  autoFocus
                  type="datetime-local"
                  value={dateDraft}
                  min={bounds.min}
                  max={bounds.max}
                  onChange={(event) => setDateDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitDate();
                    }
                  }}
                  className="w-full rounded-md border app-border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-brand-400"
                />
                <p className="text-[10px] leading-4 app-muted">
                  Read in the chart&apos;s zone. Up to {clock(endTime)}.
                </p>
                <button
                  type="button"
                  disabled={!dateDraft || busy}
                  onClick={submitDate}
                  className="rounded-md bg-brand-500 px-2 py-1.5 text-xs font-semibold text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
                >
                  Go
                </button>
              </div>
            )}
            {specific.map((choice) => (
              <ChoiceRow key={choice.key} choice={choice} busy={busy} onSelect={select} />
            ))}
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
          </Column>

          <Column title="Price crosses">
            <button
              type="button"
              onClick={() => setExpanded(expanded === "price" ? null : "price")}
              aria-expanded={expanded === "price"}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                expanded === "price" ? "bg-brand-400/10 text-brand-300" : "hover:bg-[var(--app-panel-2)]"
              }`}
            >
              Price …
              {currentPrice != null && (
                <span className="shrink-0 font-mono text-[11px] app-muted">
                  {price(currentPrice)}
                </span>
              )}
            </button>
            {expanded === "price" && (
              <div className="mb-1 flex flex-col gap-1.5 rounded-lg border app-border p-2">
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
                  className="w-full rounded-md border app-border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-brand-400"
                />
                <p className="text-[10px] leading-4 app-muted">
                  Stops on the first candle to trade through this price, in either
                  direction.
                </p>
                <button
                  type="button"
                  disabled={!priceDraft || busy}
                  onClick={submitPrice}
                  className="rounded-md bg-brand-500 px-2 py-1.5 text-xs font-semibold text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
                >
                  Go
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={levels.length === 0}
              onClick={() => setExpanded(expanded === "levels" ? null : "levels")}
              aria-expanded={expanded === "levels"}
              title={levels.length === 0 ? "No price has been revealed yet." : undefined}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                expanded === "levels" ? "bg-brand-400/10 text-brand-300" : "hover:bg-[var(--app-panel-2)]"
              }`}
            >
              Psychological levels …
            </button>
            {expanded === "levels" && (
              <div className="mb-1 grid grid-cols-2 gap-1 rounded-lg border app-border p-1.5">
                {levels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    disabled={busy}
                    onClick={() => jump({ kind: "price", price: level }, price(level))}
                    className="rounded-md px-2 py-1.5 font-mono text-[11px] hover:bg-[var(--app-panel-2)] disabled:opacity-40"
                  >
                    {price(level)}
                  </button>
                ))}
              </div>
            )}
            {crosses.map((choice) => (
              <ChoiceRow key={choice.key} choice={choice} busy={busy} onSelect={select} />
            ))}
          </Column>
        </div>

        {busy && (
          <p
            role="status"
            className="flex shrink-0 items-center gap-2 border-t app-border px-5 py-2.5 text-xs app-muted sm:px-6"
          >
            <Loader2 size={13} className="animate-spin" aria-hidden /> Running the
            replay forward…
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * One session, with its open and its close as separate destinations.
 *
 * Both edges get a button because they are opposite intentions: arriving at the
 * open is arriving to trade, and arriving at the close is arriving to see what
 * the session did.
 */
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
  const open = nextSessionEdge(currentTime, session, "open");
  const close = nextSessionEdge(currentTime, session, "close");

  const edgeButton = (
    at: number | null,
    edge: "open" | "close",
    Icon: typeof Clock,
  ) => {
    const beyond = at != null && at > endTime;
    return (
      <button
        type="button"
        disabled={busy || at == null || beyond}
        title={
          at == null
            ? `No upcoming ${session.label} ${edge}.`
            : beyond
              ? "Past the end of this session's data."
              : `${session.label} ${edge} — ${clock(at)}`
        }
        aria-label={`Go to the ${session.label} ${edge}`}
        onClick={() => at != null && onSelect({ kind: "time", timestamp: at }, `${session.label} ${edge}`)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md border app-border transition-colors hover:border-brand-400/50 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--app-border)]"
      >
        <Icon size={14} aria-hidden />
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-[var(--app-panel-2)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{session.label}</p>
        <p className="truncate text-[10px] app-muted">{session.hint}</p>
      </div>
      {edgeButton(open, "open", Clock)}
      {edgeButton(close, "close", Hourglass)}
    </div>
  );
}
