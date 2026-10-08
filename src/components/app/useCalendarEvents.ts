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
 * Nearby history is prefetched, with bounded padding for long chart windows.
 */

import { useEffect, useRef, useState } from "react";

import { loadCalendarWindow, calendarRequestWindow } from "@/lib/economic-calendar/load-window";

import type { CalendarEvent, EventImportance } from "@/lib/economic-calendar/types";

interface Options {
  enabled: boolean;
  /** Currencies whose news matters to this chart. */
  currencies: string[];
  minImportance: EventImportance;
  /** Visible calendar range in UTC seconds, or null before the chart has laid out. */
  getVisibleRange: () => { from: number; to: number } | null;
}

const POLL_MS = 250;
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
    let retryAt = 0;
    let inFlight = false;
    const controller = new AbortController();

    const load = async (from: number, to: number) => {
      inFlight = true;
      try {
        const params = new URLSearchParams({
          from: String(Math.floor(from)),
          to: String(Math.ceil(to)),
          importance: minImportance,
        });
        if (currencyKey) params.set("currencies", currencyKey);
        const data = await loadCalendarWindow(from, to, params, controller.signal);
        if (cancelled) return;
        if (!data.ok || !Array.isArray(data.events)) {
          throw new Error("Invalid calendar response.");
        }
        failures = 0;
        loadedRef.current = { from, to, currencies: currencyKey, importance: minImportance };
        setEvents(data.events);
      } catch {
        // Preserve existing markers and recover with a bounded cooldown.
        failures += 1;
        retryAt = Date.now() + Math.min(60_000, 5_000 * 2 ** Math.min(failures, 4));
      } finally {
        inFlight = false;
      }
    };

    const tick = () => {
      if (cancelled || inFlight || Date.now() < retryAt) return;
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

      const window = calendarRequestWindow(from, to);
      void load(window.from, window.to);
    };

    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, currencyKey, minImportance]);

  return enabled ? events : EMPTY;
}

const EMPTY: CalendarEvent[] = [];
