import { fetchChartData } from "@/lib/chart/fetch-data";
import type { CalendarEvent } from "./types";

const DAY = 86_400_000;

export function calendarRequestWindow(from: number, to: number) {
  const pad = Math.min(30 * DAY, Math.max(to - from, DAY / 4));
  return { from: Math.floor(from - pad), to: Math.ceil(to + pad) };
}

/** Split capped responses instead of treating an incomplete result as loaded. */
export async function loadCalendarWindow(
  from: number,
  to: number,
  filters: URLSearchParams,
  signal: AbortSignal,
): Promise<{ ok: true; events: CalendarEvent[] }> {
  if (to - from > 39 * 365 * DAY) {
    const middle = Math.floor((from + to) / 2);
    const left = await loadCalendarWindow(from, middle, filters, signal);
    const right = await loadCalendarWindow(middle + 1, to, filters, signal);
    return { ok: true, events: [...left.events, ...right.events] };
  }
  const params = new URLSearchParams(filters);
  params.set("from", String(Math.floor(from)));
  params.set("to", String(Math.ceil(to)));
  const data = await fetchChartData<{ ok?: boolean; events?: CalendarEvent[]; truncated?: boolean }>(
    `/api/calendar/events?${params}`, { signal },
  );
  if (!data.ok || !Array.isArray(data.events)) throw new Error("Unable to load calendar events.");
  if (!data.truncated) return { ok: true, events: data.events };
  if (to - from <= 1) throw new Error("Calendar window exceeds the event limit.");
  const middle = Math.floor((from + to) / 2);
  // Sequential children keep wide historical charts from flooding the API.
  const left = await loadCalendarWindow(from, middle, filters, signal);
  const right = await loadCalendarWindow(middle + 1, to, filters, signal);
  const events = [...new Map([...left.events, ...right.events].map(event => [event.id, event])).values()];
  return { ok: true, events: events.sort((a, b) => a.timestamp - b.timestamp) };
}
