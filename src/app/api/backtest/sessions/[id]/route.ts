import { NextResponse } from "next/server";

import {
  loadSession,
  toPublicState,
  visibleCandles,
} from "@/lib/backtest/session-store";
import { canAccessSession } from "@/lib/backtest/session-access";
import { getCurrentUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { sessionMetadataSchema } from "@/lib/backtest/schemas";
import type { SessionState } from "@/lib/backtest/types";

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
    notes: session.notes,
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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await loadSession(params.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user || session.userId !== user.id || session.anonymous) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }

  const parsed = sessionMetadataSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid session details." }, { status: 422 });
  }

  const state = session.ctx.state as SessionState;
  state.config = {
    ...state.config,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
    ...(parsed.data.archived !== undefined
      ? { archived: parsed.data.archived }
      : {}),
  };
  await prisma.backtestSession.update({
    where: { id: params.id },
    data: { stateJson: JSON.stringify(state) },
  });
  return NextResponse.json({ ok: true, state: toPublicState(session.ctx, false) });
}
