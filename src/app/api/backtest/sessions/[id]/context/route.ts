import { NextResponse } from "next/server";

import { canAccessSession } from "@/lib/backtest/session-access";
import { getChartContextPage, loadSession } from "@/lib/backtest/session-store";
import { isTimeframe } from "@/lib/market-data/types";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await loadSession(params.id);
  if (!session) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(session, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }

  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? session.ctx.state.config.symbol;
  const timeframe = url.searchParams.get("timeframe");
  const before = Number(url.searchParams.get("before") ?? session.ctx.state.config.startTime);
  if (!isTimeframe(timeframe) || !Number.isFinite(before)) {
    return NextResponse.json({ ok: false, error: "Invalid history request." }, { status: 422 });
  }
  try {
    const page = await getChartContextPage(session, symbol, timeframe, before);
    return NextResponse.json({ ok: true, timeframe, ...page });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "History could not be loaded." },
      { status: 400 },
    );
  }
}
