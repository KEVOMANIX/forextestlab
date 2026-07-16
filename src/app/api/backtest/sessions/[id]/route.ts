import { NextResponse } from "next/server";

import {
  loadSession,
  toPublicState,
  visibleCandles,
} from "@/lib/backtest/session-store";
import { canAccessSession } from "@/lib/backtest/session-access";
import { getCurrentUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, read-only session state + the candles revealed so far. */
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
  return NextResponse.json({
    ok: true,
    state: toPublicState(session.ctx, session.anonymous),
    candles: visibleCandles(session.ctx),
  });
}

export async function DELETE(
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
  await prisma.backtestSession.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
