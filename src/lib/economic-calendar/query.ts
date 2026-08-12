/**
 * Reads calendar releases for a chart's visible window. Server-only.
 */

import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import {
  EVENT_MULTIPLIERS,
  IMPORTANCE_LEVELS,
  IMPORTANCE_RANK,
  isEventImportance,
  isEventTimeMode,
  type CalendarEvent,
  type EventImportance,
  type EventMultiplier,
} from "./types";

export interface CalendarQuery {
  /** UTC epoch ms, inclusive. */
  from: number;
  /** UTC epoch ms, inclusive. */
  to: number;
  /** ISO currency codes. Empty or absent means every currency. */
  currencies?: string[];
  /** Lowest importance to return. Defaults to "low", which hides the filler. */
  minImportance?: EventImportance;
  limit?: number;
}

/**
 * A hard ceiling. The visible window on a monthly chart is twenty years, which
 * is six figures' worth of releases; the axis has room for a few dozen badges.
 */
export const MAX_CALENDAR_EVENTS = 1500;

/**
 * Cloudflare does not cache this JSON route by default, even when the response
 * advertises a shared TTL. Keep a small, bounded cache in the long-running AWS
 * process so repeated chart windows do not repeatedly read the same rows from
 * Supabase.
 */
const QUERY_CACHE_TTL_MS = 60 * 60 * 1000;
const QUERY_CACHE_MAX = 96;
const queryCache = new Map<string, { expiresAt: number; events: CalendarEvent[] }>();

function readCachedEvents(key: string): CalendarEvent[] | null {
  const cached = queryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    queryCache.delete(key);
    return null;
  }
  queryCache.delete(key);
  queryCache.set(key, cached);
  return cached.events;
}

function cacheEvents(key: string, events: CalendarEvent[]): void {
  queryCache.delete(key);
  queryCache.set(key, { expiresAt: Date.now() + QUERY_CACHE_TTL_MS, events });
  while (queryCache.size > QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (!oldest) break;
    queryCache.delete(oldest);
  }
}

interface EventRow {
  id: string;
  name: string;
  currency: string;
  country: string | null;
  importance: string;
  timestamp: bigint;
  timeMode: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  multiplier: string | null;
  digits: number;
}

export async function findCalendarEvents(query: CalendarQuery): Promise<CalendarEvent[]> {
  if (!Number.isFinite(query.from) || !Number.isFinite(query.to)) return [];
  if (query.to < query.from) return [];

  const currencies = (query.currencies ?? [])
    .map((currency) => currency.trim().toUpperCase())
    .filter((currency) => /^[A-Z]{3}$/.test(currency));

  const floor = IMPORTANCE_RANK[query.minImportance ?? "low"];
  const allowed = IMPORTANCE_LEVELS.filter((level) => IMPORTANCE_RANK[level] >= floor);
  if (allowed.length === 0) return [];

  const limit = Math.max(1, Math.min(query.limit ?? MAX_CALENDAR_EVENTS, MAX_CALENDAR_EVENTS));
  const from = Math.floor(query.from);
  const to = Math.ceil(query.to);
  const cacheKey = JSON.stringify([
    from,
    to,
    [...currencies].sort(),
    query.minImportance ?? "low",
    limit,
  ]);
  const cached = readCachedEvents(cacheKey);
  if (cached) return cached;

  // Ranked in SQL rather than by `orderBy: { importance: "desc" }`, which sorts
  // the words: alphabetically "none" outranks "high". A window busier than the
  // ceiling has to lose its filler, not its rate decision.
  const rows = await prisma.$queryRaw<EventRow[]>(Prisma.sql`
    SELECT "id", "name", "currency", "country", "importance", "timestamp",
           "timeMode", "actual", "forecast", "previous", "unit", "multiplier",
           "digits"
    FROM "EconomicEvent"
    WHERE "timestamp" >= ${BigInt(from)}
      AND "timestamp" <= ${BigInt(to)}
      AND "importance" IN (${Prisma.join(allowed)})
      ${
        currencies.length > 0
          ? Prisma.sql`AND "currency" IN (${Prisma.join(currencies)})`
          : Prisma.empty
      }
    ORDER BY CASE "importance"
               WHEN 'high' THEN 3
               WHEN 'medium' THEN 2
               WHEN 'low' THEN 1
               ELSE 0
             END DESC,
             "timestamp" ASC
    LIMIT ${limit}
  `);

  const events = rows.map(toCalendarEvent).sort((a, b) => a.timestamp - b.timestamp);
  cacheEvents(cacheKey, events);
  return events;
}

function toCalendarEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    country: row.country,
    importance: isEventImportance(row.importance) ? row.importance : "none",
    timestamp: Number(row.timestamp),
    timeMode: isEventTimeMode(row.timeMode) ? row.timeMode : "exact",
    actual: row.actual,
    forecast: row.forecast,
    previous: row.previous,
    unit: row.unit,
    multiplier: (EVENT_MULTIPLIERS as readonly string[]).includes(row.multiplier ?? "")
      ? (row.multiplier as EventMultiplier)
      : null,
    digits: row.digits,
  };
}
