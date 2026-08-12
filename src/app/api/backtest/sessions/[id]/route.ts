import { NextResponse } from "next/server";

import {
  dropActiveSession,
  loadSession,
  loadResumeSessionSnapshot,
  persistSession,
  toPublicState,
} from "@/lib/backtest/session-store";
import { deleteSessionSnapshot } from "@/lib/backtest/state-snapshot-store";
import { canAccessSession } from "@/lib/backtest/session-access";
import { getCurrentUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { sessionMetadataSchema } from "@/lib/backtest/schemas";
import type { SessionState } from "@/lib/backtest/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, read-only session state + the candles revealed so far. */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await loadResumeSessionSnapshot(params.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(session, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }
  const current = session.candles[session.visibleIndex] ?? null;
  const persistedState = session.stateJson.trim();
  const closingBrace = persistedState.lastIndexOf("}");
  if (closingBrace < 0) {
    return NextResponse.json({ ok: false, error: "Saved session state is invalid." }, { status: 500 });
  }

  // Stream the already-serialised state instead of parsing, deep-cloning and
  // serialising it again inside the Worker. The browser-side replay engine
  // performs the compatibility normalisation after JSON.parse.
  const publicFields = `,"visibleIndex":${session.visibleIndex},"status":${JSON.stringify(session.status)},"currentPrice":${JSON.stringify(current?.close ?? null)},"currentTime":${JSON.stringify(current?.timestamp ?? null)},"anonymous":${JSON.stringify(session.anonymous)}`;
  const candlesJson = JSON.stringify(session.candles);
  const notesJson = JSON.stringify(session.notes);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"ok":true,"state":'));
      controller.enqueue(encoder.encode(persistedState.slice(0, closingBrace)));
      controller.enqueue(encoder.encode(publicFields));
      controller.enqueue(encoder.encode('},"replayCandles":'));
      controller.enqueue(encoder.encode(candlesJson));
      controller.enqueue(encoder.encode(',"notes":'));
      controller.enqueue(encoder.encode(notesJson));
      controller.enqueue(encoder.encode("}"));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await prisma.backtestSession.findUnique({
    where: { id: params.id },
    select: {
      token: true,
      userId: true,
      anonymous: true,
      anonymousExpiresAt: true,
      stateObjectKey: true,
    },
  });
  if (!access) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(access, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }
  await prisma.backtestSession.delete({
    where: { id: params.id },
    select: { id: true },
  });
  dropActiveSession(params.id);
  void deleteSessionSnapshot(access.stateObjectKey).catch((error) => {
    console.error("Could not remove deleted session snapshot:", error);
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  await persistSession(session);
  return NextResponse.json({ ok: true, state: toPublicState(session.ctx, false) });
}
