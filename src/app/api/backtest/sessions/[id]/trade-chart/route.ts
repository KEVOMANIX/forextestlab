import { NextResponse } from "next/server";

import { canAccessSession } from "@/lib/backtest/session-access";
import { loadSession } from "@/lib/backtest/session-store";
import { getMarketDataProvider } from "@/lib/market-data";
import { isTimeframe, TIMEFRAME_MS } from "@/lib/market-data/types";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await loadSession(id);
  if (!session) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  const user = await getCurrentUser();
  if (!canAccessSession(session, user?.id ?? null, request.headers.get("x-session-token"))) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }
  const url = new URL(request.url);
  const journalId = url.searchParams.get("journalId");
  const timeframe = url.searchParams.get("timeframe");
  if (!journalId || !isTimeframe(timeframe)) return NextResponse.json({ ok: false, error: "Invalid chart request." }, { status: 422 });
  const trades = session.ctx.state.closedTrades.filter((trade) => (trade.journalId ?? trade.id) === journalId);
  const position = session.ctx.state.openPositions.find((item) => (item.journalId ?? item.id) === journalId);
  const records = position ? [...trades, position] : trades;
  if (!records.length) return NextResponse.json({ ok: false, error: "Trade not found." }, { status: 404 });
  const symbol = records[0]?.symbol ?? session.ctx.state.config.symbol;
  const entryTime = Math.min(...records.map((record) => record.entryTime));
  const exitTime = trades.length ? Math.max(...trades.map((trade) => trade.exitTime)) : session.ctx.candles[session.ctx.state.visibleIndex]?.timestamp ?? entryTime;
  const step = TIMEFRAME_MS[timeframe];
  const candles = await getMarketDataProvider().getCandles({ symbol, timeframe, startTime: Math.max(0, entryTime - step * 120), endTime: exitTime + step * 80, limit: 3000 });
  return NextResponse.json({ ok: true, symbol, timeframe, candles });
}
