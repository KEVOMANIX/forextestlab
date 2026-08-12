import { NextResponse } from "next/server";

import { findCalendarEvents, MAX_CALENDAR_EVENTS } from "@/lib/economic-calendar/query";
import { isEventImportance, type EventImportance } from "@/lib/economic-calendar/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A window wider than this is a mis-typed parameter, not a chart. */
const MAX_WINDOW_MS = 40 * 365 * 24 * 60 * 60 * 1000;
/** Align nearby chart windows so they share the AWS process cache. */
const CACHE_WINDOW_MS = 6 * 60 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = Number(searchParams.get("from"));
  const to = Number(searchParams.get("to"));

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return NextResponse.json(
      { ok: false, error: "from and to are required, as UTC epoch milliseconds." },
      { status: 400 },
    );
  }
  if (to < from) {
    return NextResponse.json({ ok: false, error: "to precedes from." }, { status: 400 });
  }
  if (to - from > MAX_WINDOW_MS) {
    return NextResponse.json({ ok: false, error: "Window too wide." }, { status: 400 });
  }

  const allowance = rateLimit(
    `calendar:${clientIp(request)}`,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!allowance.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many calendar requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((allowance.resetAt - Date.now()) / 1000))),
        },
      },
    );
  }

  const importanceParam = searchParams.get("importance");
  let minImportance: EventImportance | undefined;
  if (importanceParam !== null) {
    if (!isEventImportance(importanceParam)) {
      return NextResponse.json(
        { ok: false, error: `Unknown importance "${importanceParam}".` },
        { status: 400 },
      );
    }
    minImportance = importanceParam;
  }

  const currencies = (searchParams.get("currencies") ?? "")
    .split(",")
    .map((currency) => currency.trim())
    .filter((currency) => currency !== "");

  try {
    const cacheFrom = Math.floor(from / CACHE_WINDOW_MS) * CACHE_WINDOW_MS;
    const cacheTo = Math.ceil(to / CACHE_WINDOW_MS) * CACHE_WINDOW_MS;
    const cachedWindow = await findCalendarEvents({
      from: cacheFrom,
      to: cacheTo,
      currencies,
      minImportance,
      limit: MAX_CALENDAR_EVENTS,
    });
    const events = cachedWindow.filter(
      (event) => event.timestamp >= from && event.timestamp <= to,
    );
    // Releases only change when an import runs. Browsers and any configured
    // edge cache may reuse the response; the AWS process cache still protects
    // Supabase when Cloudflare treats this JSON route as dynamic.
    return NextResponse.json(
      {
        ok: true,
        events,
        truncated: cachedWindow.length >= MAX_CALENDAR_EVENTS,
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          "CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    // An install that has not run the calendar migration has no table to read,
    // and that must not break the chart — it simply has no news to show. Prisma
    // reports it as P2021; a raw query surfaces Postgres's 42P01 instead.
    const code = (error as { code?: string } | null)?.code;
    const message = error instanceof Error ? error.message : "Failed to load events.";
    if (code === "P2021" || code === "42P01" || /relation .*EconomicEvent.* does not exist/i.test(message)) {
      return NextResponse.json({ ok: true, events: [], truncated: false });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
