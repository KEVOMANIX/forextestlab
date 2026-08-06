"use client";

/**
 * Economic calendar badges on the time axis.
 *
 * Each release gets a flag disc sitting just above the axis labels, at the exact
 * x its minute falls on — placed through the drawing engine's projection rather
 * than the chart's own `timeToCoordinate`, because a release rarely lands on a
 * bar's open and the chart cannot place a time no bar occupies. That projection
 * also carries the weekend gaps and the forward runway, so a Friday-evening
 * figure does not slide onto Monday and next week's schedule still marks the
 * empty space ahead of the playhead.
 */

import { useState } from "react";

import { clusterEvents, type PlacedEvent } from "@/lib/economic-calendar/cluster";
import {
  formatEventTime,
  formatFigure,
  describeEvent,
  hasReportedFigures,
  revealAt,
  NO_FIGURE,
  surpriseDirection,
} from "@/lib/economic-calendar/format";
import type { CalendarEvent, EventImportance } from "@/lib/economic-calendar/types";
import { CurrencyFlag } from "./CurrencyFlag";

interface Props {
  events: CalendarEvent[];
  /** Pixels from the layer's left edge for a UTC millisecond, or null if off it. */
  timeToX: (timestampMs: number) => number | null;
  /** Layer width in CSS pixels — the chart canvas, price scale included. */
  width: number;
  /** Layer height in CSS pixels, so a card cannot grow off the top of the pane. */
  height: number;
  /** Height of the chart's time axis, so badges sit above the labels. */
  timeAxisHeight: number;
  /** Matches the drawing layer's inset when a rail is docked inside the pane. */
  insetLeft?: number;
  /** The chart's display timezone, so the card agrees with the axis. */
  zone: string;
  /** Bumped by the chart on every viewport change; re-runs the projection. */
  viewVersion: number;
  /**
   * UTC ms of the last candle the replay has revealed. A release timestamped
   * after this is one the trader has not reached yet, and its actual — already
   * sitting in the database as historical fact — is withheld until they do.
   * Null before the chart has shown any candle, which withholds everything.
   */
  revealBoundaryMs: number | null;
}

const RING: Record<EventImportance, string> = {
  high: "#f4646c",
  medium: "#f0a63a",
  low: "#8794ab",
  none: "#5b6779",
};

const BADGE_SIZE = 16;
/** Room for the ring and its shadow, and the hit area a pointer can find. */
const HIT_SIZE = 22;
const CARD_WIDTH = 208;
const CARD_GAP = 0;
/**
 * Estimated height of one event's card: name (up to two lines for something
 * like "MNI Chicago Business Barometer"), the date line, three figure rows, and
 * padding. Used only to decide how many stacked cards fit above the axis before
 * the rest collapse into "N more" — generous on purpose, since undercounting
 * clips a card while overcounting just leaves a little extra headroom.
 */
const STACK_CARD_HEIGHT_PX = 112;
/** However tall the pane, a stack longer than this is a list, not a tooltip. */
const MAX_LISTED = 6;

export function EconomicEventLayer({
  events,
  timeToX,
  width,
  height,
  timeAxisHeight,
  insetLeft = 0,
  zone,
  viewVersion,
  revealBoundaryMs,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (events.length === 0 || width <= 0) return null;
  // `viewVersion` is not read: it is the render trigger, and the projection
  // below is what consumes it. Referencing it keeps that contract visible.
  void viewVersion;

  const placed: PlacedEvent[] = [];
  for (const event of events) {
    const x = timeToX(event.timestamp);
    // Off the canvas, or in a gap the projection cannot resolve. Half a badge of
    // slack at each edge so one does not blink out while it is still half drawn.
    if (x == null || x < -HIT_SIZE / 2 || x > width + HIT_SIZE / 2) continue;
    placed.push({ event, x });
  }
  if (placed.length === 0) return null;

  const clusters = clusterEvents(placed);
  const open = clusters.find((cluster) => cluster.id === openId) ?? null;
  const badgeBottom = timeAxisHeight + 3;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-30"
      style={{ left: insetLeft, right: 0 }}
      data-testid="calendar-event-layer"
      data-calendar-badges={clusters.length}
    >
      {/*
        The line marks the release on the price, and is drawn only for the badge
        under the pointer. One per event would put a picket fence across every
        chart — and a release known only to the day has no minute to mark, so it
        gets a badge and no line.
      */}
      {open && open.events.some((event) => event.timeMode === "exact") && (
        <div
          aria-hidden
          className="absolute top-0"
          style={{
            left: open.x,
            bottom: timeAxisHeight,
            borderLeft: `1px dashed ${RING[open.importance]}`,
            opacity: 0.75,
          }}
        />
      )}

      {clusters.map((cluster) => {
        const lead = cluster.events[0]!;
        const label =
          cluster.events.length === 1
            ? describeEvent(revealAt(lead, revealBoundaryMs), zone)
            : `${cluster.events.length} releases from ${formatEventTime(lead, zone)}`;
        return (
          <button
            key={cluster.id}
            type="button"
            aria-label={label}
            title={cluster.events.length === 1 ? label : undefined}
            data-testid="calendar-event-badge"
            data-importance={cluster.importance}
            className="pointer-events-auto absolute flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            style={{
              left: cluster.x - HIT_SIZE / 2,
              bottom: badgeBottom,
              width: HIT_SIZE,
              height: HIT_SIZE,
            }}
            onPointerEnter={() => setOpenId(cluster.id)}
            onPointerLeave={() => setOpenId((current) => (current === cluster.id ? null : current))}
            onFocus={() => setOpenId(cluster.id)}
            onBlur={() => setOpenId((current) => (current === cluster.id ? null : current))}
            onClick={() => setOpenId((current) => (current === cluster.id ? null : cluster.id))}
          >
            <span
              className="relative flex items-center justify-center rounded-full"
              style={{
                boxShadow: `0 0 0 1.5px ${RING[cluster.importance]}, 0 1px 3px rgba(0,0,0,0.45)`,
              }}
            >
              <CurrencyFlag currency={lead.currency} size={BADGE_SIZE} />
              {cluster.events.length > 1 && (
                <span
                  className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full px-[3px] text-[8px] font-bold leading-none text-surface-950"
                  style={{ background: RING[cluster.importance] }}
                >
                  {cluster.events.length}
                </span>
              )}
            </span>
          </button>
        );
      })}

      {open && (
        <EventCard
          events={open.events}
          x={open.x}
          width={width}
          height={height}
          bottom={badgeBottom + HIT_SIZE + CARD_GAP}
          zone={zone}
          revealBoundaryMs={revealBoundaryMs}
        />
      )}
    </div>
  );
}

/**
 * The hover cards. Deliberately inert to the pointer: they hang over the
 * candles, and a card that could be hovered would swallow the crosshair the
 * moment it appeared.
 *
 * Releases sharing a minute get one full card apiece rather than a merged
 * summary — five figures batched into a paragraph is scanned once and
 * forgotten, five separate cards each read at their own pace. Each keeps its
 * own colour, since a batch mixing a rate decision with a minor survey should
 * not paint the minor one red just because it arrived with the rate decision.
 */
function EventCard({
  events,
  x,
  width,
  height,
  bottom,
  zone,
  revealBoundaryMs,
}: {
  events: CalendarEvent[];
  x: number;
  width: number;
  height: number;
  bottom: number;
  zone: string;
  revealBoundaryMs: number | null;
}) {
  // Centred on the badge, then pushed back inside the pane. A card that runs off
  // the right edge is exactly the card a trader wants at the hard right of a
  // replay, where the next release sits.
  const left = Math.min(Math.max(4, x - CARD_WIDTH / 2), Math.max(4, width - CARD_WIDTH - 4));

  // A batch of releases shares a minute, and stacking all of them as full cards
  // can run taller than the pane — that grew a card off the top of the
  // workspace with its first entries unreachable. So the stack is cut to what
  // fits, and says how much it cut.
  const room = Math.max(0, height - bottom - 8);
  const perCard = STACK_CARD_HEIGHT_PX + CARD_GAP;
  const fits = Math.max(1, Math.floor((room + CARD_GAP) / perCard));
  const listed = events.slice(0, Math.min(fits, MAX_LISTED));
  const hidden = events.length - listed.length;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid="calendar-event-stack"
      data-listed={listed.length}
      data-hidden={hidden}
    >
      {listed.map((event, index) => (
        <SingleEventCard
          key={event.id}
          event={event}
          zone={zone}
          left={left}
          bottom={bottom + index * perCard}
          revealBoundaryMs={revealBoundaryMs}
        />
      ))}
      {hidden > 0 && (
        <div
          className="absolute rounded-md border app-border px-2.5 py-1 text-[10.5px] text-[var(--chart-muted)] shadow-lg"
          style={{
            left,
            bottom: bottom + listed.length * perCard,
            width: CARD_WIDTH,
            background: "var(--app-panel-solid)",
          }}
        >
          and {hidden} more
        </div>
      )}
    </div>
  );
}

/**
 * One release: name, when, then Actual / Forecast / Previous as a column — or
 * just the name and when, for something that never carries a number.
 */
function SingleEventCard({
  event,
  zone,
  left,
  bottom,
  revealBoundaryMs,
}: {
  event: CalendarEvent;
  zone: string;
  left: number;
  bottom: number;
  revealBoundaryMs: number | null;
}) {
  // `hasReportedFigures` is checked on the record as imported, before masking:
  // a still-pending release with a real forecast must keep its figures block
  // even once `revealed` has withheld its own actual.
  const showFigures = hasReportedFigures(event);
  const revealed = revealAt(event, revealBoundaryMs);

  return (
    <div
      data-testid="calendar-event-card"
      className="absolute overflow-hidden rounded-md border app-border shadow-xl"
      style={{
        left,
        bottom,
        width: CARD_WIDTH,
        background: "var(--app-panel-solid)",
        borderLeft: `3px solid ${RING[event.importance]}`,
      }}
    >
      <div className="px-3 py-2">
        <div className="flex items-start gap-1.5">
          <CurrencyFlag currency={event.currency} size={13} className="mt-[2px] shrink-0" />
          <span className="text-[11.5px] font-semibold leading-tight text-[var(--chart-text)]">
            {event.name}
          </span>
        </div>
        <div className="mt-1 text-[10.5px] text-[var(--chart-muted)]">
          {formatEventTime(event, zone)}
        </div>
        {showFigures && (
          <dl className="mt-1.5 space-y-0.5 text-[10.5px]">
            <Figure label="Actual" event={revealed} which="actual" />
            <Figure label="Forecast" event={revealed} which="forecast" />
            <Figure label="Previous" event={revealed} which="previous" />
          </dl>
        )}
      </div>
    </div>
  );
}

const SURPRISE_COLOUR = { beat: "#22c3a0", miss: "#f4646c", met: undefined } as const;

function Figure({
  label,
  event,
  which,
}: {
  label: string;
  event: CalendarEvent;
  which: "actual" | "forecast" | "previous";
}) {
  const text = formatFigure(event[which], event);
  // Only the actual is coloured, and only once there is a forecast to judge it
  // against. Tinting the forecast would imply the market had an opinion the
  // calendar does not record.
  const surprise = which === "actual" ? surpriseDirection(event) : null;
  const colour = surprise ? SURPRISE_COLOUR[surprise] : undefined;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--chart-muted)]">{label}</dt>
      <dd
        className="font-mono font-semibold tabular-nums"
        style={{ color: colour ?? (text === NO_FIGURE ? "var(--chart-muted)" : "var(--chart-text)") }}
      >
        {text}
      </dd>
    </div>
  );
}
