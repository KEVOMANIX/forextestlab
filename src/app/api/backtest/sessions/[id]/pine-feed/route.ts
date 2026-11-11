import { NextResponse } from "next/server";

import { canAccessSession } from "@/lib/backtest/session-access";
import { getPineFeed, loadSession } from "@/lib/backtest/session-store";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { isTimeframe } from "@/lib/market-data/types";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Candles for a chart Pine script's request.security(): another market, or a lower timeframe. */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await loadSession(params.id);
  if (!session) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(session, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }
  if (!rateLimit(`pine-feed:${params.id}`, 120, 60_000).ok) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
  const timeframe = url.searchParams.get("timeframe");
  const from = Number(url.searchParams.get("from"));
  if (!isTimeframe(timeframe) || !Number.isFinite(from) || !/^[A-Z0-9]{3,20}$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 422 });
  }
  if (!getSymbolDefinition(symbol)) {
    return NextResponse.json({ ok: false, error: `${symbol} is not a market ForexTestLab has data for.` }, { status: 404 });
  }
  // Reading other markets and lower timeframes from scripts is part of Pro.
  const entitlements = user ? await getUserEntitlements(user.id) : null;
  if (!entitlements?.pine.otherMarkets) {
    return NextResponse.json({ ok: false, code: "plan_limit", error: "Pine scripts read other markets and lower timeframes on Pro. Free scripts use this chart's market at its timeframe or higher." }, { status: 403 });
  }
  try {
    const candles = await getPineFeed(session, symbol, timeframe, from);
    return NextResponse.json({ ok: true, candles });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : `${symbol} data could not be loaded.` },
      { status: 503 },
    );
  }
}
