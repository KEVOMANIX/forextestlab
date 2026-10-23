import { NextResponse } from "next/server";

import { analyticsTrades } from "@/lib/analytics/trade-scope";
import { loadSession } from "@/lib/backtest/session-store";
import { tradesCsv, tradesCsvFileName } from "@/lib/backtest/trade-export";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trade export (CSV). A Pro feature, so the file is built here, behind the check. */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const [session, entitlements] = await Promise.all([loadSession(params.id), getUserEntitlements(user.id)]);
  if (!session || session.userId !== user.id || session.anonymous) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  if (!entitlements.exports) {
    return NextResponse.json({ ok: false, error: "Trade and analytics exports are part of Pro." }, { status: 403 });
  }
  const state = session.ctx.state;
  const trades = analyticsTrades(state.closedTrades);
  return new NextResponse(tradesCsv(trades, state.config.symbol), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tradesCsvFileName(trades, state.config.symbol, session.id)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
