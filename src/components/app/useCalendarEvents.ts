"use client";

/**
 * Loads calendar releases for whatever window a chart is looking at.
 *
 * The visible range is read by polling rather than by subscribing to the chart's
 * viewport: during replay it changes every frame, and a state update per frame
 * per pane would cost more than the badges are worth. Polling four times a second
 * is enough to keep a fetch ahead of the edge of the loaded window, and the
 * badges themselves are positioned from the live projection on every render, so
 * nothing about their placement waits on this.
 *
 * A window three times the visible span is loaded, so panning or replaying
 * roughly a screen in either direction needs no second request.
 */

import { useEffect, useRef, useState } from "react";

import type { CalendarEvent, EventImportance } from "@/lib/economic-calendar/types";

interface Options {
  enabled: boolean;
  /** Currencies whose news matters to this chart. */
  currencies: string[];
  minImportance: EventImportance;
  /** Visible calendar range in UTC ms, or null before the chart has laid out. */
  getVisibleRange: () => { from: number; to: number } | null;
}

const POLL_MS = 250;
/** How far either side of the visible span to load. */
const PAD_FACTOR = 1;
/** Below this the window is padded to a fixed floor, or a one-minute chart refetches constantly. */
const MIN_PAD_MS = 6 * 60 * 60 * 1000;
/** Consecutive failures before the pane gives up until something changes. */
const MAX_FAILURES = 3;

interface Loaded {
  from: number;
  to: number;
  currencies: string;
  importance: EventImportance;
}

export function useCalendarEvents({
  enabled,
  currencies,
  minImportance,
  getVisibleRange,
}: Options): CalendarEvent[] {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const loadedRef = useRef<Loaded | null>(null);
  const inFlightRef = useRef(false);
  const rangeRef = useRef(getVisibleRange);
  rangeRef.current = getVisibleRange;

  const currencyKey = [...currencies].sort().join(",");

  useEffect(() => {
    if (!enabled) {
      loadedRef.current = null;
      setEvents([]);
      return;
    }

    let cancelled = false;
    let failures = 0;

    const load = async (from: number, to: number) => {
      inFlightRef.current = true;
      try {
        const params = new URLSearchParams({
          from: String(Math.floor(from)),
          to: String(Math.ceil(to)),
          importance: minImportance,
        });
        if (currencyKey) params.set("currencies", currencyKey);
        const response = await fetch(`/api/calendar/events?${params}`);
        const data = (await response.json()) as { ok?: boolean; events?: CalendarEvent[] };
        if (cancelled) return;
        if (!data.ok || !Array.isArray(data.events)) {
          failures += 1;
          return;
        }
        failures = 0;
        loadedRef.current = { from, to, currencies: currencyKey, importance: minImportance };
        setEvents(data.events);
      } catch {
        // Offline, or the route is broken. Counted rather than retried blindly:
        // a failure leaves the loaded window unset, so without the count the
        // poll below would re-request four times a second indefinitely.
        failures += 1;
      } finally {
        inFlightRef.current = false;
      }
    };

    const tick = () => {
      if (cancelled || inFlightRef.current || failures >= MAX_FAILURES) return;
      const visible = rangeRef.current();
      if (!visible) return;
      // Times come off the chart in seconds.
      const from = visible.from * 1000;
      const to = visible.to * 1000;
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;

      const loaded = loadedRef.current;
      const stale =
        loaded == null ||
        loaded.currencies !== currencyKey ||
        loaded.importance !== minImportance ||
        from < loaded.from ||
        to > loaded.to;
      if (!stale) return;

      const pad = Math.max((to - from) * PAD_FACTOR, MIN_PAD_MS);
      void load(from - pad, to + pad);
    };

    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, currencyKey, minImportance]);

  return enabled ? events : EMPTY;
}

const EMPTY: CalendarEvent[] = [];
