import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { actionSchema } from "@/lib/backtest/schemas";
import {
  loadSession,
  persistSession,
  toPublicState,
} from "@/lib/backtest/session-store";
import {
  closeAllPositions,
  closePosition,
  cancelPendingOrder,
  expirePendingOrders,
  modifyPendingOrder,
  modifyStopLoss,
  modifyTakeProfit,
  modifyTrailingStop,
  moveReplayToIndex,
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
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { updateTradeJournal } from "@/lib/backtest/trade-journal";

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

  const requestedIndex = "targetIndex" in action ? action.targetIndex : undefined;
  if (requestedIndex !== undefined && action.type !== "prev") {
    const target = Math.min(requestedIndex, ctx.state.totalCandles - 1);
    while (ctx.state.visibleIndex < target && revealNext(ctx)) {
      // Reproduce every intervening candle so SL/TP and equity remain exact.
    }
  }

  switch (action.type) {
    case "sync":
      if (action.status) setStatus(ctx, action.status);
      break;
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
      let stepped = action.targetIndex !== undefined
        ? moveReplayToIndex(ctx, action.targetIndex)
        : false;
      if (action.targetIndex === undefined) {
        for (let index = 0; index < (action.steps ?? 1); index += 1) {
          if (!stepBack(ctx)) break;
          stepped = true;
        }
      }
      if (!stepped) opError = "Stepping back is not allowed here.";
      break;
    }
    case "set-speed":
      if (
        action.speed >
        (session.userId
          ? (await getUserEntitlements(session.userId)).maxReplaySpeed
          : 1200)
      ) {
        opError = "Upgrade to Pro to unlock the fastest replay speeds.";
      } else {
        setSpeed(ctx, action.speed);
      }
      break;
    case "restart":
      restart(ctx);
      break;
    case "end":
      if (ctx.state.openPositions.length > 0) closeAllPositions(ctx);
      expirePendingOrders(ctx);
      setStatus(ctx, "finished");
      ctx.state.status = "finished";
      break;
    case "close": {
      const r = closePosition(ctx, action.positionId, action.lots);
      if (!r.ok) opError = r.error;
      break;
    }
    case "close-all": {
      const r = closeAllPositions(ctx);
      if (!r.ok) opError = r.error;
      break;
    }
    case "place-order": {
      const r = placeOrder(ctx, {
        clientOrderId: action.clientOrderId,
        direction: action.direction,
        orderType: action.orderType,
        entryPrice: action.entryPrice,
        expiresAt: action.expiresAt,
        sizingMode: action.sizingMode,
        lots: action.lots,
        riskPercent: action.riskPercent,
        stopLoss: action.stopLoss,
        takeProfit: action.takeProfit,
      });
      if (!r.ok) {
        opError = r.error;
      } else {
        const pos = ctx.state.openPositions.at(-1);
        if (pos && (action.orderType ?? "market") === "market") {
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
    case "modify-pending": {
      const r = modifyPendingOrder(ctx, action.orderId, action.price);
      if (!r.ok) opError = r.error;
      break;
    }
    case "cancel-pending": {
      const r = cancelPendingOrder(ctx, action.orderId);
      if (!r.ok) opError = r.error;
      break;
    }
    case "modify-stop": {
      const r = modifyStopLoss(ctx, action.price, action.positionId);
      if (!r.ok) opError = r.error;
      break;
    }
    case "modify-target": {
      const r = modifyTakeProfit(ctx, action.price, action.positionId);
      if (!r.ok) opError = r.error;
      break;
    }
    case "modify-trailing": {
      const r = modifyTrailingStop(ctx, action.pips, action.positionId);
      if (!r.ok) opError = r.error;
      break;
    }
    case "update-journal":
      if (session.anonymous) {
        opError = "Sign in to save a private trade journal.";
      } else if (!updateTradeJournal(ctx, action.journalId, action.journal)) {
        opError = "Trade journal not found.";
      }
      break;
    case "add-bookmark": {
      const candle = ctx.candles[ctx.state.visibleIndex];
      if (!candle) {
        opError = "No current candle to bookmark.";
      } else if (!ctx.state.bookmarks.some((item) => item.id === action.bookmarkId)) {
        ctx.state.bookmarks.push({
          id: action.bookmarkId,
          index: ctx.state.visibleIndex,
          time: candle.timestamp,
          note: action.note ?? "",
          createdAt: Date.now(),
        });
      }
      break;
    }
    case "update-bookmark": {
      const bookmark = ctx.state.bookmarks.find((item) => item.id === action.bookmarkId);
      if (!bookmark) opError = "Bookmark not found.";
      else bookmark.note = action.note;
      break;
    }
    case "delete-bookmark":
      if (!ctx.state.bookmarks.some((item) => item.id === action.bookmarkId)) {
        opError = "Bookmark not found.";
      } else {
        ctx.state.bookmarks = ctx.state.bookmarks.filter((item) => item.id !== action.bookmarkId);
      }
      break;
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
