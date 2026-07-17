import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { actionSchema } from "@/lib/backtest/schemas";
import {
  loadSession,
  persistSession,
  toPublicState,
} from "@/lib/backtest/session-store";
import {
  closePosition,
  modifyStopLoss,
  modifyTakeProfit,
  placeOrder,
  restart,
  revealNext,
  setSpeed,
  setStatus,
  stepBack,
} from "@/lib/backtest/replay-engine";
import type { Candle } from "@/lib/market-data/types";
import { rateLimit } from "@/lib/rate-limit";
import { canAccessSession } from "@/lib/backtest/session-access";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const limit = rateLimit(`action:${params.id}`, 1200, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid action.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const action = parsed.data;
  const ctx = session.ctx;
  let newCandle: Candle | null = null;
  let opError: string | undefined;
  let orderProjection: Promise<unknown> | null = null;

  switch (action.type) {
    case "start":
      setStatus(ctx, "running");
      break;
    case "pause":
      setStatus(ctx, "paused");
      break;
    case "resume":
      setStatus(ctx, "running");
      break;
    case "next": {
      const advanced = revealNext(ctx);
      if (advanced) newCandle = ctx.candles[ctx.state.visibleIndex] ?? null;
      break;
    }
    case "prev": {
      const stepped = stepBack(ctx);
      if (!stepped) opError = "Stepping back is not allowed here.";
      break;
    }
    case "set-speed":
      setSpeed(ctx, action.speed);
      break;
    case "restart":
      restart(ctx);
      break;
    case "end":
      if (ctx.state.openPosition) closePosition(ctx);
      setStatus(ctx, "finished");
      ctx.state.status = "finished";
      break;
    case "close": {
      const r = closePosition(ctx);
      if (!r.ok) opError = r.error;
      break;
    }
    case "place-order": {
      const r = placeOrder(ctx, {
        direction: action.direction,
        sizingMode: action.sizingMode,
        lots: action.lots,
        riskPercent: action.riskPercent,
        stopLoss: action.stopLoss,
        takeProfit: action.takeProfit,
      });
      if (!r.ok) {
        opError = r.error;
      } else {
        const pos = ctx.state.openPosition;
        if (pos) {
          orderProjection = prisma.simulatedOrder.create({
            data: {
              sessionId: session.id,
              direction: pos.direction,
              sizingMode: action.sizingMode,
              lots: pos.lots,
              requestedStopLoss: pos.stopLoss,
              requestedTakeProfit: pos.takeProfit,
              createdIndex: pos.entryIndex,
              createdTime: BigInt(pos.entryTime),
            },
          });
        }
      }
      break;
    }
    case "modify-stop": {
      const r = modifyStopLoss(ctx, action.price);
      if (!r.ok) opError = r.error;
      break;
    }
    case "modify-target": {
      const r = modifyTakeProfit(ctx, action.price);
      if (!r.ok) opError = r.error;
      break;
    }
    case "notes":
      if (session.anonymous) {
        opError = "Sign in to save private session notes.";
      } else {
        session.notes = action.notes;
      }
      break;
  }

  await Promise.all([
    persistSession(session, { resetProjections: action.type === "restart" }),
    orderProjection,
  ]);

  if (opError) {
    return NextResponse.json(
      { ok: false, error: opError, state: toPublicState(ctx, session.anonymous) },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    state: toPublicState(ctx, session.anonymous),
    newCandle,
  });
}
