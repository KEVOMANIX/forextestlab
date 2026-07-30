import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessSession } from "@/lib/backtest/session-access";
import {
  loadSession,
  visiblePairCandles,
} from "@/lib/backtest/session-store";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addPairSchema = z.object({ symbol: z.string().trim().min(1).max(24) });

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await loadSession(params.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(session, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }
  const query = new URL(request.url).searchParams;
  const symbol = query.get("symbol") ?? "";
  try {
    const pair = await visiblePairCandles(session, symbol, query.get("full") === "1");
    return NextResponse.json({ ok: true, symbol, ...pair });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Pair unavailable." },
      { status: 400 },
    );
  }
}

/**
 * Add a reference pair to a session already in progress.
 *
 * The traded instrument never changes — that is what the session's results are
 * measured against. This only widens the set of symbols the workspace may chart,
 * so a trader can bring up a correlated market without abandoning the session.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await loadSession(params.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(session, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }

  const limit = rateLimit(`add-pair:${params.id}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = addPairSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Choose a symbol." }, { status: 422 });
  }
  const symbol = parsed.data.symbol.toUpperCase();

  if (!getSymbolDefinition(symbol)) {
    return NextResponse.json({ ok: false, error: "Unknown symbol." }, { status: 422 });
  }

  const config = session.ctx.state.config;
  const current = config.symbols?.length ? config.symbols : [config.symbol];
  if (current.includes(symbol)) {
    return NextResponse.json({ ok: true, symbols: current });
  }

  // Same rule as session creation, which only caps pair count for signed-in
  // users; anonymous demonstration sessions are gated by expiry instead.
  if (user) {
    const entitlements = await getUserEntitlements(user.id);
    if (
      entitlements.maxPairsPerSession !== null &&
      current.length + 1 > entitlements.maxPairsPerSession
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Charting more than one symbol in a session is part of Pro. Upgrade to add reference pairs.",
        },
        { status: 403 },
      );
    }
  }

  // Provisionally admit the symbol so the same loader the client will use decides
  // whether this session's date range actually has data for it.
  const next = [...current, symbol];
  config.symbols = next;
  try {
    const pair = await visiblePairCandles(session, symbol, true);
    if (pair.candles.length < 2) {
      throw new Error("No market data for this symbol over the session's dates.");
    }
    await prisma.backtestSession.update({
      where: { id: session.id },
      data: { stateJson: JSON.stringify(session.ctx.state) },
    });
    return NextResponse.json({ ok: true, symbols: next });
  } catch (error) {
    config.symbols = current;
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "That symbol could not be added to this session.",
      },
      { status: 422 },
    );
  }
}
