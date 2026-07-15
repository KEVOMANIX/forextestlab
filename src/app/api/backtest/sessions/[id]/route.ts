import { NextResponse } from "next/server";

import {
  loadSession,
  toPublicState,
  visibleCandles,
} from "@/lib/backtest/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, read-only session state + the candles revealed so far. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await loadSession(params.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    state: toPublicState(session.ctx),
    candles: visibleCandles(session.ctx),
  });
}
